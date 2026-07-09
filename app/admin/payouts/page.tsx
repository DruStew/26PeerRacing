import { ManualPayoutForm } from "@/components/admin/ManualPayoutForm";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getStripe } from "@/lib/stripe/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { formatUsdFromCents } from "@/lib/wallet/format-money";
import type { PayoutRequestRow } from "@/lib/wallet/payout-config";

export const dynamic = "force-dynamic";

/**
 * Cash-outs and the one-pool coverage report. Coverage = money in the Stripe
 * pool minus everything owed (wallet balances + shootout fund). It should sit
 * around Peer Racing's accumulated revenue; if it trends toward zero,
 * something upstream leaked (unrecorded cash payout, uncollected sponsor
 * money credited at publish).
 */

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  canceled: "bg-[#1E3A5F]/10 text-[#1E3A5F]/70",
  failed: "bg-red-100 text-red-800",
};

export default async function AdminPayoutsPage() {
  await requireAdmin("/admin/payouts");

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  // ---- coverage report -------------------------------------------------------
  const [{ data: ledgerRows }, { data: shootoutRows }] = await Promise.all([
    service.from("wallet_ledger").select("amount_cents"),
    service.from("shootout_fund_ledger").select("amount_cents"),
  ]);
  const walletLiabilitiesCents = (ledgerRows ?? []).reduce(
    (s, r) => s + Number((r as { amount_cents: number }).amount_cents),
    0,
  );
  const shootoutCents = (shootoutRows ?? []).reduce(
    (s, r) => s + Number((r as { amount_cents: number }).amount_cents),
    0,
  );

  const stripe = getStripe();
  let stripeAvailableCents: number | null = null;
  let stripePendingCents: number | null = null;
  if (stripe) {
    try {
      const bal = await stripe.balance.retrieve();
      stripeAvailableCents = bal.available
        .filter((b) => b.currency === "usd")
        .reduce((s, b) => s + b.amount, 0);
      stripePendingCents = bal.pending
        .filter((b) => b.currency === "usd")
        .reduce((s, b) => s + b.amount, 0);
    } catch {
      // Balance unavailable (bad key etc.) — show liabilities anyway.
    }
  }
  const owedCents = walletLiabilitiesCents + shootoutCents;
  const poolCents =
    stripeAvailableCents != null && stripePendingCents != null
      ? stripeAvailableCents + stripePendingCents
      : null;
  const coverageCents = poolCents != null ? poolCents - owedCents : null;

  // ---- payout history ---------------------------------------------------------
  const { data: requestsRaw } = await service
    .from("wallet_payout_requests")
    .select(
      "id,user_id,amount_cents,fee_cents,net_cents,method,status,stripe_transfer_id,manual_method,manual_reference,failure_reason,requested_at,paid_at",
    )
    .order("requested_at", { ascending: false })
    .limit(100);
  const requests = (requestsRaw ?? []) as PayoutRequestRow[];

  const userIds = [...new Set(requests.map((r) => r.user_id))];
  const profileById = new Map<string, { name: string; email: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id,first_name,last_name,email")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      const r = p as { id: string; first_name: string | null; last_name: string | null; email: string | null };
      profileById.set(r.id, {
        name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "(no name)",
        email: r.email,
      });
    }
  }

  const coverageCards = [
    {
      label: "Stripe pool",
      value: poolCents != null ? formatUsdFromCents(poolCents) : "—",
      hint:
        stripeAvailableCents != null
          ? `${formatUsdFromCents(stripeAvailableCents)} available · ${formatUsdFromCents(stripePendingCents ?? 0)} settling`
          : "Stripe balance unavailable",
    },
    {
      label: "Owed (liabilities)",
      value: formatUsdFromCents(owedCents),
      hint: `${formatUsdFromCents(walletLiabilitiesCents)} wallets · ${formatUsdFromCents(shootoutCents)} shootout fund`,
    },
    {
      label: "Coverage (PR's money)",
      value: coverageCents != null ? formatUsdFromCents(coverageCents) : "—",
      hint: "Pool minus owed. Should stay positive — investigate if it trends toward zero.",
      alert: coverageCents != null && coverageCents < 0,
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
        Internal · Finance
      </p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
        Payouts & Coverage
      </h1>
      <p className="mt-3 max-w-3xl text-pretty text-[#1E3A5F]/75">
        Racer cash-outs (Stripe transfers happen automatically when a racer requests one) and the
        one-pool reconciliation check. Wallet money never leaves except through this system.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Coverage</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {coverageCards.map((c) => (
            <div
              key={c.label}
              className={`rounded-xl border p-5 shadow-sm ${
                c.alert ? "border-red-300 bg-red-50" : "border-[#1E3A5F]/10 bg-[#fafbfc]"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                {c.label}
              </p>
              <p
                className={`font-display mt-2 text-2xl font-bold tabular-nums ${
                  c.alert ? "text-red-700" : "text-[#1E3A5F]"
                }`}
              >
                {c.value}
              </p>
              <p className="mt-2 text-xs text-[#1E3A5F]/55">{c.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <ManualPayoutForm />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">
          Cash-out history ({requests.length})
        </h2>
        {requests.length === 0 ? (
          <p className="mt-3 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] px-6 py-8 text-center text-sm text-[#1E3A5F]/65">
            No cash-outs yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[#1E3A5F]/10 text-left text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Net paid</th>
                  <th className="px-4 py-3">Fee</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E3A5F]/10">
                {requests.map((r) => {
                  const who = profileById.get(r.user_id);
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#1E3A5F]">{who?.name ?? r.user_id}</p>
                        {who?.email ? (
                          <p className="text-xs text-[#1E3A5F]/55">{who.email}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-[#1E3A5F]">
                        {formatUsdFromCents(r.net_cents)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#1E3A5F]/70">
                        {r.fee_cents > 0 ? formatUsdFromCents(r.fee_cents) : "—"}
                      </td>
                      <td className="px-4 py-3 text-[#1E3A5F]/80">
                        {r.method === "stripe"
                          ? "Stripe → bank"
                          : `Manual (${String(r.manual_method ?? "other").replace("_", " ")})`}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            STATUS_BADGE[r.status] ?? "bg-[#1E3A5F]/10 text-[#1E3A5F]/70"
                          }`}
                        >
                          {r.status}
                        </span>
                        {r.failure_reason ? (
                          <p className="mt-1 max-w-[220px] text-xs text-red-700">{r.failure_reason}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[#1E3A5F]/70">{fmtDate(r.requested_at)}</td>
                      <td className="px-4 py-3 text-xs text-[#1E3A5F]/60">
                        {r.stripe_transfer_id ?? r.manual_reference ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
