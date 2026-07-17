import Link from "next/link";

import { FlyerLightbox } from "@/components/events/FlyerLightbox";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { eventEntryWindowStatus, finalDayIsOver } from "@/lib/event-entry-status";
import { formatDistanceDisplay } from "@/lib/distance-display";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";
import { supabaseServer } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import {
  loadPublicAwardMarketing,
  type PublicAwardMarketing,
} from "@/lib/awards/public-marketing";

const PAGE_SIZE = 10;

/** Set to "true" to show per-race entry counts (Field ticker). Off by default. */
const showEntryCounts =
  process.env.NEXT_PUBLIC_PEER_RACING_SHOW_ENTRY_COUNTS === "true";

function formatEntryDeadline(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return value;
}

function racerLabel(n: number): string {
  return n === 1 ? "1 racer" : `${n} racers`;
}

function compactUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

function formatOpensDate(value: string | null): string {
  if (!value) return "soon";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "soon";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type DistanceRow = {
  id: string;
  event_id: string;
  label: string;
  race_name?: string | null;
  sort_order: number | null;
  pr_cutoff: string | null;
  results_published_at: string | null;
  allow_walk_ups?: boolean | null;
};

function sortDistancesForDisplay(distances: DistanceRow[]): DistanceRow[] {
  return [...distances].sort((a, b) => {
    const ao = a.sort_order ?? 999;
    const bo = b.sort_order ?? 999;
    if (ao !== bo) return ao - bo;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Earliest online-registration close (first door to close) for the list card:
 * legacy per-distance deadlines, falling back to the event-level close.
 */
function earliestOnlineRegClose(
  eventPrCutoff: string | null,
  distances: DistanceRow[],
): string | null {
  let best: number | null = null;
  for (const d of distances) {
    if (!d.pr_cutoff) continue;
    const t = new Date(d.pr_cutoff).getTime();
    if (Number.isNaN(t)) continue;
    if (best === null || t < best) best = t;
  }
  if (best != null) return new Date(best).toISOString();
  if (eventPrCutoff) {
    const t = new Date(eventPrCutoff).getTime();
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, Number(resolvedSearchParams.page ?? "1"));
  const from = (page - 1) * PAGE_SIZE;

  // Find a Race lists every published event through the end of its final race
  // day (walk-ups can still enter at the desk after online reg closes). Events
  // fall off after the final day — or earlier once all results are published —
  // and surface on the public Race Results index instead.
  const { data: events } = await supabaseServer
    .from("events")
    .select("id,name,city,state,race_date,end_date,pr_cutoff,entries_open_at")
    .eq("status", "published")
    .order("race_date", { ascending: true });

  const allEvents = events ?? [];
  const allEventIds = allEvents.map((e) => e.id);

  const distancesByEvent = new Map<string, DistanceRow[]>();
  if (allEventIds.length > 0) {
    const { data: distanceRows } = await supabaseServer
      .from("distances")
      .select("id,event_id,label,race_name,sort_order,pr_cutoff,results_published_at,allow_walk_ups")
      .in("event_id", allEventIds);

    for (const row of distanceRows ?? []) {
      const d = row as DistanceRow;
      const arr = distancesByEvent.get(d.event_id) ?? [];
      arr.push(d);
      distancesByEvent.set(d.event_id, arr);
    }
  }
  const allDistanceIds = [...distancesByEvent.values()].flat().map((distance) => distance.id);
  const service = createServiceRoleSupabaseClient();
  const awardMarketing = service
    ? await loadPublicAwardMarketing(service, allDistanceIds)
    : new Map<string, PublicAwardMarketing>();

  const openEvents = allEvents.filter((e) => {
    if (finalDayIsOver(e as { race_date: string | null; end_date?: string | null })) return false;
    const dists = distancesByEvent.get(e.id) ?? [];
    const allPublished = dists.length > 0 && dists.every((d) => d.results_published_at);
    return !allPublished;
  });

  const totalPages = Math.max(1, Math.ceil(openEvents.length / PAGE_SIZE));
  const list = openEvents.slice(from, from + PAGE_SIZE);
  const eventIds = list.map((e) => e.id);

  const countByEventDistance = new Map<string, Map<string, number>>();
  if (showEntryCounts && eventIds.length > 0) {
    const { data: countRows, error: countRpcError } =
      await supabaseServer.rpc("entry_counts_for_events", {
        p_event_ids: eventIds,
      });
    if (countRpcError && process.env.NODE_ENV === "development") {
      console.warn(
        "[entry_counts_for_events] RPC missing or failed — apply supabase/migrations/20260330000000_entry_counts_for_events_rpc.sql (or snippets/entry_counts_for_events_rpc.sql):",
        countRpcError.message,
      );
    }
    for (const raw of countRows ?? []) {
      const row = raw as {
        event_id: string;
        distance_id: string;
        entry_count: number | string;
      };
      const n = Number(row.entry_count);
      if (!countByEventDistance.has(row.event_id)) {
        countByEventDistance.set(row.event_id, new Map());
      }
      countByEventDistance
        .get(row.event_id)!
        .set(row.distance_id, Number.isFinite(n) ? n : 0);
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-10 text-center sm:text-left">
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            Upcoming Races
          </h1>
          <p className="mt-3 text-[#1E3A5F]/70">
            Find your next race and register today
          </p>
        </div>

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 py-16 text-center">
            <svg
              className="h-12 w-12 text-[#1E3A5F]/30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <h2 className="mt-4 font-display text-lg font-semibold text-[#1E3A5F]">
              No Events Found
            </h2>
            <p className="mt-2 max-w-sm text-sm text-[#1E3A5F]/60">
              Check back soon for upcoming races.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-4">
              {list.map((event) => {
                const distances = sortDistancesForDisplay(
                  distancesByEvent.get(event.id) ?? [],
                );
                const eventPrCutoff = (event as { pr_cutoff?: string | null }).pr_cutoff ?? null;
                const entriesOpenAt =
                  (event as { entries_open_at?: string | null }).entries_open_at ?? null;
                const listDeadline = earliestOnlineRegClose(eventPrCutoff, distances);
                const entryStatus = eventEntryWindowStatus(entriesOpenAt, eventPrCutoff, distances);
                const entriesOpen = entryStatus === "open";
                const walkUpsAvailable =
                  entryStatus === "closed" &&
                  distances.some((d) => !d.results_published_at && d.allow_walk_ups !== false);
                const dCounts = countByEventDistance.get(event.id);
                const artworkUrl = (event as { artwork_url?: string | null }).artwork_url ?? null;

                return (
                  <li key={event.id}>
                    <div
                      className={`flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md sm:flex-row sm:items-start sm:justify-between ${
                        entriesOpen || walkUpsAvailable || entryStatus === "not_yet_open"
                          ? "border-[#1E3A5F]/10 hover:border-[#E87722]/50"
                          : "border-[#1E3A5F]/15 bg-[#fafbfc] hover:border-[#1E3A5F]/25"
                      }`}
                    >
                      {artworkUrl ? (
                        <FlyerLightbox
                          src={artworkUrl}
                          alt={`${event.name} — race artwork`}
                          variant="card"
                        />
                      ) : null}
                      <Link
                        href={`/events/${event.id}`}
                        className="group flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 gap-y-1">
                            <h2 className="font-display text-xl font-semibold text-[#1E3A5F] transition-colors group-hover:text-[#E87722]">
                              {event.name}
                            </h2>
                            {entryStatus === "not_yet_open" ? (
                              <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-600/20">
                                Registration opens {formatOpensDate(entriesOpenAt)}
                              </span>
                            ) : entriesOpen ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/15">
                                Entries open
                              </span>
                            ) : walkUpsAvailable ? (
                              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20">
                                Walk-ups on race day
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-[#1E3A5F]/08 px-2 py-0.5 text-xs font-medium text-[#1E3A5F]/80 ring-1 ring-[#1E3A5F]/15">
                                Entries closed
                              </span>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#1E3A5F]/70">
                            <span className="inline-flex items-center gap-1.5">
                              <svg
                                className="h-4 w-4 shrink-0 text-[#E87722]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                aria-hidden
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              {formatCalendarDate(event.race_date)}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <svg
                                className="h-4 w-4 shrink-0 text-[#E87722]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                aria-hidden
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              {[event.city, event.state]
                                .filter(Boolean)
                                .join(", ") || "—"}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <svg
                                className="h-4 w-4 shrink-0 text-[#E87722]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                aria-hidden
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              {entryStatus === "not_yet_open"
                                ? `Online reg opens: ${formatEntryDeadline(entriesOpenAt)}`
                                : `Online reg closes: ${formatEntryDeadline(listDeadline)}`}
                            </span>
                          </div>
                          {distances.length > 0 ? (
                            <div
                              className="mt-3 border-t border-[#1E3A5F]/10 pt-3"
                              aria-label={
                                showEntryCounts
                                  ? "Registered racers per race"
                                  : "Races at this event"
                              }
                            >
                              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#1E3A5F]/50">
                                {showEntryCounts ? "Field" : "At a glance"}
                              </p>
                              <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                                {distances.map((d) => {
                                  const n = dCounts?.get(d.id) ?? 0;
                                  const awards = d.results_published_at ? undefined : awardMarketing.get(d.id);
                                  const prizeNames = awards
                                    ? [...new Set(awards.prizes.map((prize) => prize.name))]
                                    : [];
                                  return (
                                    <div
                                      key={d.id}
                                      className="shrink-0 rounded-lg border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 px-3 py-2 text-xs text-[#1E3A5F]/90 sm:text-sm"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-medium">
                                          {formatDistanceDisplay({
                                            label: d.label,
                                            race_name: d.race_name,
                                          })}
                                        </span>
                                        {showEntryCounts ? (
                                          <>
                                            <span className="text-[#1E3A5F]/55">·</span>
                                            <span>{racerLabel(n)}</span>
                                          </>
                                        ) : null}
                                      </div>
                                      {awards ? (
                                        <p className="mt-1 max-w-64 text-[11px] font-semibold leading-snug text-[#E87722] sm:text-xs">
                                          {awards.cashMode
                                            ? `${awards.cashMode === "guaranteed" ? "Guaranteed" : "Estimated"} ${compactUsd(awards.cashHeadlineCents)} cash`
                                            : null}
                                          {awards.cashMode && awards.prizes.length > 0 ? " + " : null}
                                          {awards.prizes.length > 0
                                            ? `prizes${awards.prizeMaxPlace > 0 ? ` through ${ordinal(awards.prizeMaxPlace)}` : ""}`
                                            : null}
                                        </p>
                                      ) : null}
                                      {awards?.cashMode === "entry_based" ? (
                                        <p className="mt-0.5 max-w-64 text-[10px] leading-snug text-[#1E3A5F]/55">
                                          Based on {awards.modeledEntryCount ?? 0} modeled entries at{" "}
                                          {compactUsd(awards.modeledEntryFeeCents ?? 0)}. Final payout uses checked-in,
                                          paid racers.
                                        </p>
                                      ) : null}
                                      {prizeNames.length > 0 ? (
                                        <p className="mt-0.5 max-w-64 text-[10px] leading-snug text-[#1E3A5F]/65">
                                          Prize line: {prizeNames.slice(0, 3).join(" · ")}
                                          {prizeNames.length > 3 ? ` · +${prizeNames.length - 3} more` : ""}
                                        </p>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center justify-center self-start rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                            entriesOpen
                              ? "bg-[#E87722] text-white group-hover:bg-[#E87722]/90"
                              : "border border-[#1E3A5F]/20 bg-white text-[#1E3A5F] group-hover:border-[#1E3A5F]/35"
                          }`}
                        >
                          View details
                        </span>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              {page > 1 ? (
                <Link
                  href={`${DEFAULT_PUBLIC_ROUTE}?page=${page - 1}`}
                  className="inline-flex items-center gap-1 rounded-md border border-[#1E3A5F]/20 px-4 py-2 text-sm font-medium text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Previous
                </Link>
              ) : null}
              <span className="text-sm text-[#1E3A5F]/60">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={`${DEFAULT_PUBLIC_ROUTE}?page=${page + 1}`}
                  className="inline-flex items-center gap-1 rounded-md border border-[#1E3A5F]/20 px-4 py-2 text-sm font-medium text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
                >
                  Next
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
