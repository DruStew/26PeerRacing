import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type LedgerRow = {
  id: string;
  event_id: string;
  distance_id: string;
  fraction: number;
  entry_count: number;
  amount_cents: number;
  created_at: string;
};

function fmtUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default async function ShootoutFundPage() {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect(`/login?returnUrl=${encodeURIComponent("/promoter/shootout-fund")}`);
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const { data: ledgerRaw } = await service
    .from("shootout_fund_ledger")
    .select("id,event_id,distance_id,fraction,entry_count,amount_cents,created_at")
    .order("created_at", { ascending: false });
  const ledger = (ledgerRaw ?? []) as LedgerRow[];

  const eventIds = [...new Set(ledger.map((r) => r.event_id))];
  const distanceIds = [...new Set(ledger.map((r) => r.distance_id))];

  const [eventsRes, distancesRes] = await Promise.all([
    eventIds.length > 0
      ? service.from("events").select("id,name,city,state,race_date").in("id", eventIds)
      : Promise.resolve({ data: [] }),
    distanceIds.length > 0
      ? service.from("distances").select("id,label").in("id", distanceIds)
      : Promise.resolve({ data: [] }),
  ]);

  const eventById = new Map(
    ((eventsRes.data ?? []) as { id: string; name: string; city: string | null; state: string | null; race_date: string | null }[]).map(
      (e) => [e.id, e],
    ),
  );
  const distanceLabelById = new Map(
    ((distancesRes.data ?? []) as { id: string; label: string | null }[]).map((d) => [d.id, d.label ?? "Race"]),
  );

  const grandTotalCents = ledger.reduce((s, r) => s + Number(r.amount_cents), 0);

  // Global fund, tracked per distance label (e.g. all 10Ks across the series).
  const byDistanceLabel = new Map<string, { totalCents: number; races: number }>();
  for (const r of ledger) {
    const label = distanceLabelById.get(r.distance_id) ?? "Race";
    const agg = byDistanceLabel.get(label) ?? { totalCents: 0, races: 0 };
    agg.totalCents += Number(r.amount_cents);
    agg.races += 1;
    byDistanceLabel.set(label, agg);
  }
  const distanceTotals = [...byDistanceLabel.entries()].sort((a, b) => b[1].totalCents - a[1].totalCents);

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <LandingNavbar />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href="/promoter"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to your events
        </Link>

        <div className="mt-6 border-b border-[#1E3A5F]/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">Series</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            Shootout fund
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#1E3A5F]/75">
            Every race banks a percentage of its pot into the shootout fund. It all stacks up here — added money for
            the series finale, funded by the racers all season long.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border-2 border-[#E87722]/40 bg-[#E87722]/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#E87722]">Total fund</p>
            <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">{fmtUsd(grandTotalCents)}</p>
          </div>
          <div className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">Races banked</p>
            <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">{ledger.length}</p>
          </div>
          <div className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">Racers contributing</p>
            <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">
              {ledger.reduce((s, r) => s + Number(r.entry_count), 0)}
            </p>
          </div>
        </div>

        {distanceTotals.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#1E3A5F]/75">
            {distanceTotals.map(([label, agg]) => (
              <span key={label} className="rounded-full bg-white px-3 py-1 ring-1 ring-[#1E3A5F]/10">
                <span className="font-semibold text-[#1E3A5F]">{label}:</span> {fmtUsd(agg.totalCents)}{" "}
                <span className="text-[#1E3A5F]/55">
                  · {agg.races} {agg.races === 1 ? "race" : "races"}
                </span>
              </span>
            ))}
          </div>
        ) : null}

        {ledger.length === 0 ? (
          <div className="mt-10 rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 p-10 text-center">
            <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Nothing Banked Yet</h2>
            <p className="mt-2 text-sm text-[#1E3A5F]/60">
              Set a shootout fund percentage in a race&apos;s payout calculator — it banks here automatically when that
              race&apos;s results publish.
            </p>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[#1E3A5F]/10 text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Race</th>
                  <th className="px-4 py-3">Banked</th>
                  <th className="px-4 py-3 text-right">Holding %</th>
                  <th className="px-4 py-3 text-right">Racers</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => {
                  const ev = eventById.get(r.event_id);
                  const location = ev ? [ev.city, ev.state].filter(Boolean).join(", ") : "";
                  return (
                    <tr key={r.id} className="border-b border-[#1E3A5F]/5 last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/promoter/events/${r.event_id}/payout`}
                          className="font-medium text-[#1E3A5F] underline-offset-2 hover:text-[#E87722] hover:underline"
                        >
                          {ev?.name ?? "Event"}
                        </Link>
                        <p className="text-xs text-[#1E3A5F]/55">
                          {[location, ev?.race_date ? formatCalendarDate(ev.race_date) : null].filter(Boolean).join(" · ")}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[#1E3A5F]/85">{distanceLabelById.get(r.distance_id) ?? "Race"}</td>
                      <td className="px-4 py-3 text-[#1E3A5F]/70">{formatCalendarDate(r.created_at.slice(0, 10))}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#1E3A5F]/85">
                        {(Number(r.fraction) * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#1E3A5F]/85">{r.entry_count}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#E87722]">
                        {fmtUsd(Number(r.amount_cents))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs text-[#1E3A5F]/55">
          Amounts bank automatically when a race&apos;s results are published and reverse if results are unpublished.
        </p>
      </main>
    </div>
  );
}
