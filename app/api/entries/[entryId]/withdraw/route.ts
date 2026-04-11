import { NextResponse } from "next/server";

import { isDistanceEntryOpen } from "@/lib/entry-cutoff";
import { insertWalletCreditForEntryWithdrawal } from "@/lib/wallet/credit-entry-withdrawal";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EntryWithdrawRow = {
  id: string;
  user_id: string;
  event_id: string;
  distance_id: string;
  entry_type: string;
  source_entry_id: string | null;
  entry_kind: string;
  paid_at: string | null;
  paid_amount_cents: number | null;
};

/** Columns that exist on all deployed DBs; omit optional wallet columns so SELECT cannot fail. */
const ENTRY_SELECT =
  "id, user_id, event_id, distance_id, entry_type, source_entry_id, entry_kind, paid_at" as const;

function parseEntryId(raw: { entryId?: string | string[] }): string | null {
  const v = raw.entryId;
  if (v == null) return null;
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/**
 * Withdraw from a single entry (one distance) while registration is open.
 * Paid entries: net wallet credit (gross less estimated Stripe fee), then row delete.
 * Requires SUPABASE_SERVICE_ROLE_KEY for paid rows (wallet credit + delete bypass if needed).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ entryId?: string | string[] }> },
) {
  const params = await context.params;
  const entryId = parseEntryId(params);
  if (!entryId) {
    return NextResponse.json({ ok: false, error: "Invalid entry" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }

  const userId = user.id;
  const admin = createServiceRoleSupabaseClient();
  const dbWrite = admin ?? supabase;

  async function withPaidAmountCents(
    base: Omit<EntryWithdrawRow, "paid_amount_cents">,
  ): Promise<EntryWithdrawRow> {
    let paid_cents: number | null = null;
    if (admin) {
      const { data: fr } = await admin
        .from("entries")
        .select("paid_amount_cents")
        .eq("id", base.id)
        .eq("user_id", userId)
        .maybeSingle();
      const c = (fr as { paid_amount_cents?: number | null } | null)?.paid_amount_cents;
      paid_cents = typeof c === "number" ? c : null;
    }
    return { ...base, paid_amount_cents: paid_cents };
  }

  const { data: entryRows, error: loadError } = await supabase
    .from("entries")
    .select(ENTRY_SELECT)
    .eq("id", entryId)
    .eq("user_id", userId)
    .limit(1);

  if (loadError) {
    return NextResponse.json(
      { ok: false, error: "Entry not found" },
      { status: 404 },
    );
  }

  const entryRaw = entryRows?.[0];
  if (!entryRaw) {
    return NextResponse.json({ ok: false, error: "Entry not found" }, { status: 404 });
  }

  const row = await withPaidAmountCents(
    entryRaw as Omit<EntryWithdrawRow, "paid_amount_cents">,
  );

  const { data: event } = await supabase
    .from("events")
    .select("pr_cutoff")
    .eq("id", row.event_id)
    .maybeSingle();

  const { data: distance } = await supabase
    .from("distances")
    .select("pr_cutoff")
    .eq("id", row.distance_id)
    .maybeSingle();

  const open = isDistanceEntryOpen(
    event?.pr_cutoff ?? null,
    distance?.pr_cutoff ?? null,
  );
  if (!open) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Registration has closed for this race. Withdrawals are no longer available and entry fees are not refunded.",
      },
      { status: 403 },
    );
  }

  const { data: dependentRows } = await supabase
    .from("entries")
    .select(ENTRY_SELECT)
    .eq("user_id", userId)
    .eq("source_entry_id", entryId);

  const dependents: EntryWithdrawRow[] = [];
  for (const d of dependentRows ?? []) {
    dependents.push(await withPaidAmountCents(d as Omit<EntryWithdrawRow, "paid_amount_cents">));
  }

  async function maybeCreditWallet(withdrawRow: {
    id: string;
    event_id: string;
    entry_kind: string;
    paid_at: string | null;
    paid_amount_cents: number | null;
    distance_id: string;
  }): Promise<NextResponse | null> {
    if (withdrawRow.entry_kind !== "paid" || !withdrawRow.paid_at) {
      return null;
    }
    if (!admin) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Paid entry withdrawal requires wallet credit. Set SUPABASE_SERVICE_ROLE_KEY on the server.",
        },
        { status: 503 },
      );
    }

    const { data: dist } = await supabase
      .from("distances")
      .select("label, entry_fee_cents")
      .eq("id", withdrawRow.distance_id)
      .maybeSingle();

    const credit = await insertWalletCreditForEntryWithdrawal(admin, {
      userId,
      entryId: withdrawRow.id,
      eventId: withdrawRow.event_id,
      entryKind: withdrawRow.entry_kind,
      paidAt: withdrawRow.paid_at,
      paidAmountCents: withdrawRow.paid_amount_cents,
      distanceEntryFeeCents: dist?.entry_fee_cents ?? null,
      distanceLabel: dist?.label ?? null,
    });

    if (!credit.ok) {
      return NextResponse.json({ ok: false, error: credit.reason }, { status: 400 });
    }
    return null;
  }

  for (const dep of dependents) {
    const err = await maybeCreditWallet(dep);
    if (err) return err;
    const { error: depErr } = await dbWrite
      .from("entries")
      .delete()
      .eq("id", dep.id)
      .eq("user_id", userId);
    if (depErr) {
      return NextResponse.json(
        { ok: false, error: depErr.message ?? "Could not remove linked entries" },
        { status: 400 },
      );
    }
  }

  const creditErr = await maybeCreditWallet(row);
  if (creditErr) return creditErr;

  const { error: delErr } = await dbWrite
    .from("entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", userId);

  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
