import Link from "next/link";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { areEntriesOpenForEvent } from "@/lib/event-entry-status";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DistanceRow = {
  id: string;
  event_id: string;
  label: string | null;
  gun_time: string | null;
  sort_order: number | null;
  pr_cutoff: string | null;
  results_published_at: string | null;
};

type EventRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  race_date: string | null;
};

type DistanceStatus = "published" | "awaiting" | "open";

function distanceStatus(d: DistanceRow): DistanceStatus {
  if (d.results_published_at) return "published";
  // A distance is "awaiting" once it's no longer accepting entries (race ran) but
  // hasn't been scored yet; distances still open for entry don't belong here.
  const stillOpen = areEntriesOpenForEvent(null, [
    { pr_cutoff: d.pr_cutoff, results_published_at: d.results_published_at },
  ]);
  return stillOpen ? "open" : "awaiting";
}

export default async function RaceResultsIndexPage() {
  const { data: eventRows } = await supabaseServer
    .from("events")
    .select("id,name,city,state,race_date")
    .eq("status", "published")
    .order("race_date", { ascending: false });

  const allEvents = (eventRows ?? []) as EventRow[];
  const allEventIds = allEvents.map((e) => e.id);

  const distancesByEvent = new Map<string, DistanceRow[]>();
  if (allEventIds.length > 0) {
    const { data: distanceRows } = await supabaseServer
      .from("distances")
      .select("id,event_id,label,gun_time,sort_order,pr_cutoff,results_published_at")
      .in("event_id", allEventIds);
    for (const row of (distanceRows ?? []) as DistanceRow[]) {
      const arr = distancesByEvent.get(row.event_id) ?? [];
      arr.push(row);
      distancesByEvent.set(row.event_id, arr);
    }
  }

  const sortDistances = (rows: DistanceRow[]): DistanceRow[] =>
    [...rows].sort((a, b) => {
      const at = a.gun_time ? new Date(a.gun_time).getTime() : NaN;
      const bt = b.gun_time ? new Date(b.gun_time).getTime() : NaN;
      if (!Number.isNaN(at) && !Number.isNaN(bt) && at !== bt) return at - bt;
      return (a.sort_order ?? 999) - (b.sort_order ?? 999);
    });

  // An event belongs on this page once a race has run: it has published results
  // and/or distances awaiting scoring. Still-open races stay on Find a Race.
  const cards = allEvents
    .map((event) => {
      const rows = sortDistances(distancesByEvent.get(event.id) ?? []).map((d) => ({
        ...d,
        status: distanceStatus(d),
      }));
      const published = rows.filter((d) => d.status === "published");
      const awaiting = rows.filter((d) => d.status === "awaiting");
      const lastPublishedAt = published.reduce((max, d) => {
        const t = d.results_published_at ? new Date(d.results_published_at).getTime() : 0;
        return Number.isNaN(t) ? max : Math.max(max, t);
      }, 0);
      const raceTime = event.race_date ? new Date(event.race_date).getTime() : 0;
      return {
        event,
        published,
        awaiting,
        sortAt: lastPublishedAt || raceTime,
      };
    })
    .filter((c) => c.published.length > 0 || c.awaiting.length > 0)
    .sort((a, b) => b.sortAt - a.sortAt);

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-10 text-center sm:text-left">
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            Race Results
          </h1>
          <p className="mt-3 text-[#1E3A5F]/70">
            Official, published results — standings, divisions, badges, and payouts.
          </p>
        </div>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 py-16 text-center">
            <svg className="h-12 w-12 text-[#1E3A5F]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0H5a2 2 0 01-2-2V7a2 2 0 012-2h2m10 14h2a2 2 0 002-2V7a2 2 0 00-2-2h-2"
              />
            </svg>
            <h2 className="mt-4 font-display text-lg font-semibold text-[#1E3A5F]">No Results Yet</h2>
            <p className="mt-2 max-w-sm text-sm text-[#1E3A5F]/60">
              Results appear here as soon as a race is scored and published.{" "}
              <Link href={DEFAULT_PUBLIC_ROUTE} className="font-medium text-[#E87722] hover:underline">
                Find a race
              </Link>{" "}
              to get in the next one.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {cards.map(({ event, published, awaiting }) => {
              const location = [event.city, event.state].filter(Boolean).join(", ");
              const awaitingOnly = published.length === 0;
              return (
                <li
                  key={event.id}
                  className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <Link
                      href={`/events/${event.id}`}
                      className="font-display text-xl font-semibold text-[#1E3A5F] transition-colors hover:text-[#E87722]"
                    >
                      {event.name}
                    </Link>
                    <p className="text-sm text-[#1E3A5F]/60">
                      {[formatCalendarDate(event.race_date), location].filter(Boolean).join(" · ")}
                    </p>
                  </div>

                  {awaitingOnly ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                      Race complete — results not submitted yet
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {published.map((d) => (
                      <Link
                        key={d.id}
                        href={`/events/${event.id}/results/${d.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0H5a2 2 0 01-2-2V7a2 2 0 012-2h2m10 14h2a2 2 0 002-2V7a2 2 0 00-2-2h-2m-6 0V3h6v2m-6 0h6"
                          />
                        </svg>
                        {d.label ?? "Results"}
                      </Link>
                    ))}
                    {/* When some distances are scored but others aren't, mark the stragglers. */}
                    {!awaitingOnly
                      ? awaiting.map((d) => (
                          <span
                            key={d.id}
                            className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900"
                            title="Results have not been submitted for this distance yet"
                          >
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                            {d.label ?? "Distance"} · pending
                          </span>
                        ))
                      : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
