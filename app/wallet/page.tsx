import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { CashOutCard } from "@/components/wallet/CashOutCard";
import { DEFAULT_PUBLIC_ROUTE, MY_ENTRIES_ROUTE } from "@/lib/routes";
import { getConnectAccountRow, refreshConnectStatus } from "@/lib/stripe/connect";
import { getStripe } from "@/lib/stripe/server";
import { formatUsdFromCents } from "@/lib/wallet/format-money";
import {
  MIN_PAYOUT_CENTS,
  PAYOUT_FLAT_FEE_CENTS,
  type PayoutRequestRow,
} from "@/lib/wallet/payout-config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

type LedgerRow = {
  id: string;
  amount_cents: number;
  /** App schema */
  category?: string | null;
  /** Legacy MVP schema */
  source?: string | null;
  label?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const categoryLabel: Record<string, string> = {
  entry_withdrawal_credit: "Entry withdrawal credit",
  race_payout: "Race winnings",
  promoter_event_earnings: "Event earnings",
  membership_credit: "Membership",
  bank_withdrawal: "Transfer to bank",
  entry_payment_from_wallet: "Paid from wallet",
  adjustment: "Adjustment",
};

export default async function WalletPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent("/wallet")}`);
  }

  const { data: raw, error } = await supabase
    .from("wallet_ledger")
    .select("id, amount_cents, category, label, metadata, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (raw ?? []) as LedgerRow[];
  const balanceCents = rows.reduce((sum, r) => sum + Number(r.amount_cents), 0);

  // Cash-out state: Connect status (refreshed from Stripe while onboarding is
  // incomplete, so returning from the hosted flow shows up immediately).
  const stripe = getStripe();
  const service = createServiceRoleSupabaseClient();
  let connectAccount = service ? await getConnectAccountRow(service, user.id) : null;
  if (connectAccount && !connectAccount.payouts_enabled && stripe && service) {
    try {
      connectAccount = await refreshConnectStatus(service, stripe, connectAccount);
    } catch {
      // Stripe hiccup — show last-known status rather than erroring the page.
    }
  }

  const { data: payoutRaw } = await supabase
    .from("wallet_payout_requests")
    .select(
      "id,amount_cents,fee_cents,net_cents,method,status,manual_method,requested_at,paid_at",
    )
    .eq("user_id", user.id)
    .order("requested_at", { ascending: false })
    .limit(25);
  const payoutRequests = (payoutRaw ?? []) as Array<
    Pick<
      PayoutRequestRow,
      | "id"
      | "amount_cents"
      | "fee_cents"
      | "net_cents"
      | "method"
      | "status"
      | "manual_method"
      | "requested_at"
      | "paid_at"
    >
  >;
  const cashOutAvailable = Boolean(stripe && service);

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Peer Racing
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
          Wallet
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-[#1E3A5F]/75">
          Credits from race winnings, event earnings (for producers), and entry withdrawals appear
          here. Spend your balance on race entries anytime for free, or cash out to your bank below
          (flat {formatUsdFromCents(PAYOUT_FLAT_FEE_CENTS)} processing fee when money leaves Peer
          Racing).
        </p>

        <div className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#1E3A5F]/50">Balance</p>
          <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">
            {formatUsdFromCents(balanceCents)}
          </p>
        </div>

        {cashOutAvailable ? (
          <CashOutCard
            balanceCents={balanceCents}
            minCents={MIN_PAYOUT_CENTS}
            feeCents={PAYOUT_FLAT_FEE_CENTS}
            payoutsEnabled={Boolean(connectAccount?.payouts_enabled)}
            onboardingStarted={Boolean(connectAccount)}
            requests={payoutRequests}
          />
        ) : null}

        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Activity</h2>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-[#1E3A5F]/65">
              No transactions yet. Withdrawing from a paid entry while registration is open credits your
              wallet for the full entry amount you paid.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[#1E3A5F]/10 rounded-xl border border-[#1E3A5F]/10 bg-white">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-[#1E3A5F]">
                      {row.label ||
                        categoryLabel[row.category ?? row.source ?? ""] ||
                        row.category ||
                        row.source ||
                        "Wallet"}
                    </p>
                    <p className="text-xs text-[#1E3A5F]/55">
                      {new Date(row.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold tabular-nums sm:text-base ${
                      row.amount_cents >= 0 ? "text-emerald-800" : "text-red-800"
                    }`}
                  >
                    {row.amount_cents >= 0 ? "+" : ""}
                    {formatUsdFromCents(row.amount_cents)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link
            href={MY_ENTRIES_ROUTE}
            className="font-medium text-[#E87722] underline-offset-2 hover:underline"
          >
            My Entries
          </Link>
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="font-medium text-[#E87722] underline-offset-2 hover:underline"
          >
            Upcoming Races
          </Link>
        </div>
      </main>
    </div>
  );
}
