import { NextResponse } from "next/server";

import { authKioskForEvent } from "@/lib/kiosk/auth-kiosk-event";
import { insertWalletCreditForEntryWithdrawal } from "@/lib/wallet/credit-entry-withdrawal";

export const dynamic = "force-dynamic";

const ENTRY_SELECT =
  "id, user_id, event_id, distance_id, entry_type, source_entry_id, entry_kind, paid_at, paid_amount_cents" as const;

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

/**
 * Race-day withdrawal from kiosk: wallet credit for paid entries (same as runner self-serve),
 * then delete. Registration cutoff is ignored (director override at the event).
 */
export async function POST(request: Request) {
  let body: { eventId?: string; entryId?: string };
  try {
    body = (await request.json()) as { eventId?: string; entryId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const entryId = typeof body.entryId === "string" ? body.entryId.trim() : "";
  if (!eventId || !entryId) {
    return NextResponse.json({ ok: false, error: "Missing eventId or entryId" }, { status: 400 });
  }

  const auth = await authKioskForEvent(request, eventId);
  if (!auth.ok) {
    return auth.response;
  }

  const admin = auth.admin;

  const { data: entryRows, error: loadError } = await admin
    .from("entries")
    .select(ENTRY_SELECT)
    .eq("id", entryId)
    .eq("event_id", eventId)
    .limit(1);

  if (loadError || !entryRows?.[0]) {
    return NextResponse.json({ ok: false, error: "Entry not found for this event" }, { status: 404 });
  }

  const row = entryRows[0] as EntryWithdrawRow;

  const { data: dependentRows } = await admin
    .from("entries")
    .select(ENTRY_SELECT)
    .eq("user_id", row.user_id)
    .eq("source_entry_id", entryId);

  const dependents = (dependentRows ?? []) as EntryWithdrawRow[];

  async function maybeCreditWallet(withdrawRow: EntryWithdrawRow): Promise<NextResponse | null> {
    if (withdrawRow.entry_kind !== "paid" || !withdrawRow.paid_at) {
      return null;
    }

    const { data: dist } = await admin
      .from("distances")
      .select("label, entry_fee_cents")
      .eq("id", withdrawRow.distance_id)
      .maybeSingle();

    const credit = await insertWalletCreditForEntryWithdrawal(admin, {
      userId: withdrawRow.user_id,
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
    const { error: depErr } = await admin.from("entries").delete().eq("id", dep.id);
    if (depErr) {
      return NextResponse.json({ ok: false, error: depErr.message ?? "Could not remove linked entries" }, { status: 400 });
    }
  }

  const creditErr = await maybeCreditWallet(row);
  if (creditErr) return creditErr;

  const { error: delErr } = await admin.from("entries").delete().eq("id", entryId);
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message ?? "Could not withdraw" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
