import { NextResponse } from "next/server";

import { getConnectAccountRow, refreshConnectStatus } from "@/lib/stripe/connect";
import { getStripe } from "@/lib/stripe/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  MIN_PAYOUT_CENTS,
  PAYOUT_FLAT_FEE_CENTS,
  payoutNetCents,
} from "@/lib/wallet/payout-config";
import { formatUsdFromCents } from "@/lib/wallet/format-money";

export const dynamic = "force-dynamic";

/**
 * POST — cash out wallet balance to the user's bank via Stripe Connect.
 *
 * Order of operations keeps the books tight:
 *   1. create the request row (audit trail)
 *   2. hold: balance-checked atomic wallet debit (can never overdraw)
 *   3. Stripe transfer of the net amount to the connected account
 *   4. mark paid — or on transfer failure, release the hold and mark failed
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to cash out." }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 503 });
  }
  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  let body: { amount_cents?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const amountCents = Math.floor(Number(body.amount_cents));
  if (!Number.isFinite(amountCents) || amountCents < MIN_PAYOUT_CENTS) {
    return NextResponse.json(
      { ok: false, error: `Minimum cash-out is ${formatUsdFromCents(MIN_PAYOUT_CENTS)}.` },
      { status: 400 },
    );
  }
  const netCents = payoutNetCents(amountCents);

  // Connected account must be fully onboarded (payouts enabled).
  let account = await getConnectAccountRow(service, user.id);
  if (account && !account.payouts_enabled) {
    account = await refreshConnectStatus(service, stripe, account);
  }
  if (!account || !account.payouts_enabled) {
    return NextResponse.json(
      { ok: false, error: "Finish payout setup (bank details) before cashing out." },
      { status: 400 },
    );
  }

  // 1. Audit-trail row first, so every hold in the ledger points at a request.
  const { data: inserted, error: insertErr } = await service
    .from("wallet_payout_requests")
    .insert({
      user_id: user.id,
      amount_cents: amountCents,
      fee_cents: PAYOUT_FLAT_FEE_CENTS,
      net_cents: netCents,
      method: "stripe",
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { ok: false, error: insertErr?.message ?? "Could not create the request." },
      { status: 500 },
    );
  }
  const requestId = (inserted as { id: string }).id;

  // 2. Hold — atomic, balance-checked debit.
  const { error: holdErr } = await service.rpc("wallet_apply_payout_hold", {
    p_user_id: user.id,
    p_amount_cents: amountCents,
    p_request_id: requestId,
    p_label: `Cash out to bank (${formatUsdFromCents(netCents)} after fee)`,
  });
  if (holdErr) {
    await service.from("wallet_payout_requests").delete().eq("id", requestId);
    const friendly = holdErr.message.includes("insufficient_wallet_balance")
      ? "That's more than your wallet balance."
      : holdErr.message;
    return NextResponse.json({ ok: false, error: friendly }, { status: 400 });
  }

  // 3. Move real money: transfer net to their connected account. Stripe then
  // pays their bank on the account's payout schedule (default: daily auto).
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: netCents,
        currency: "usd",
        destination: account.stripe_account_id,
        description: "Peer Racing wallet cash-out",
        metadata: { payout_request_id: requestId, peer_racing_user_id: user.id },
      },
      { idempotencyKey: `payout-${requestId}` },
    );

    await service
      .from("wallet_payout_requests")
      .update({
        status: "paid",
        stripe_transfer_id: transfer.id,
        paid_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    return NextResponse.json({ ok: true, net_cents: netCents });
  } catch (e) {
    // 4. Transfer failed — put the money back and record why.
    const reason = e instanceof Error ? e.message : "Stripe transfer failed";
    await service.rpc("wallet_release_payout_hold", {
      p_user_id: user.id,
      p_amount_cents: amountCents,
      p_request_id: requestId,
      p_label: "Cash out failed — funds returned",
    });
    await service
      .from("wallet_payout_requests")
      .update({ status: "failed", failure_reason: reason.slice(0, 500) })
      .eq("id", requestId);
    return NextResponse.json(
      {
        ok: false,
        error:
          "The transfer didn't go through — your wallet was not charged. Please try again shortly.",
      },
      { status: 502 },
    );
  }
}
