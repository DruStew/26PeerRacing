import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DEFAULT_PUBLIC_ROUTE, MY_ENTRIES_ROUTE } from "@/lib/routes";
import { formatUsdFromCents } from "@/lib/wallet/format-money";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
          Credits from race winnings, event earnings (for producers), entry withdrawals, and future
          membership top-ups appear here. Processing fees apply when money leaves Peer Racing (e.g.
          refund to your card). Bank transfers out will be added later.
        </p>

        <div className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#1E3A5F]/50">Balance</p>
          <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">
            {formatUsdFromCents(balanceCents)}
          </p>
        </div>

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
