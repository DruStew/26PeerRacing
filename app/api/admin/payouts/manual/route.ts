import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { formatUsdFromCents } from "@/lib/wallet/format-money";

export const dynamic = "force-dynamic";

const MANUAL_METHODS = new Set(["cash", "cash_app", "venmo", "check", "other"]);

/**
 * POST — admin escape hatch: record a payout made outside Stripe (cash at the
 * race, Cash App, check for a minor). Debits the racer's wallet (hold) and
 * marks the request paid in one step, with method + reference for the books.
 * No fee — the admin hands over exactly what the wallet is debited.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { data: adminRow } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "super_admin"])
    .limit(1)
    .maybeSingle();
  if (!adminRow) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  let body: {
    email?: string;
    amount_cents?: number;
    manual_method?: string;
    manual_reference?: string;
    note?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Member email is required." }, { status: 400 });
  }
  const amountCents = Math.floor(Number(body.amount_cents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "Enter a valid amount." }, { status: 400 });
  }
  const manualMethod = String(body.manual_method ?? "").trim();
  if (!MANUAL_METHODS.has(manualMethod)) {
    return NextResponse.json({ ok: false, error: "Pick how you paid them." }, { status: 400 });
  }
  const manualReference = String(body.manual_reference ?? "").trim().slice(0, 200) || null;
  const note = String(body.note ?? "").trim().slice(0, 500) || null;

  const { data: profile } = await service
    .from("profiles")
    .select("id,first_name,last_name,email")
    .ilike("email", email)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: `No member found with email ${email}.` },
      { status: 404 },
    );
  }
  const targetUserId = (profile as { id: string }).id;

  const { data: inserted, error: insertErr } = await service
    .from("wallet_payout_requests")
    .insert({
      user_id: targetUserId,
      amount_cents: amountCents,
      fee_cents: 0,
      net_cents: amountCents,
      method: "manual",
      status: "pending",
      manual_method: manualMethod,
      manual_reference: manualReference,
      note,
      processed_by: user.id,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { ok: false, error: insertErr?.message ?? "Could not create the payout record." },
      { status: 500 },
    );
  }
  const requestId = (inserted as { id: string }).id;

  const { error: holdErr } = await service.rpc("wallet_apply_payout_hold", {
    p_user_id: targetUserId,
    p_amount_cents: amountCents,
    p_request_id: requestId,
    p_label: `Paid out ${formatUsdFromCents(amountCents)} (${manualMethod.replace("_", " ")})`,
  });
  if (holdErr) {
    await service.from("wallet_payout_requests").delete().eq("id", requestId);
    const friendly = holdErr.message.includes("insufficient_wallet_balance")
      ? "That's more than this member's wallet balance."
      : holdErr.message;
    return NextResponse.json({ ok: false, error: friendly }, { status: 400 });
  }

  await service
    .from("wallet_payout_requests")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", requestId);

  const name = [
    (profile as { first_name?: string | null }).first_name,
    (profile as { last_name?: string | null }).last_name,
  ]
    .filter(Boolean)
    .join(" ");
  return NextResponse.json({
    ok: true,
    message: `Recorded ${formatUsdFromCents(amountCents)} paid to ${name || email}.`,
  });
}
