import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";
import { requireActiveMembership, type MembershipRow } from "@/lib/membership";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Same flag as public /events — opt-in entry counts on the Field row. */
const showEntryCounts =
  process.env.NEXT_PUBLIC_PEER_RACING_SHOW_ENTRY_COUNTS === "true";

function racerLabel(n: number): string {
  return n === 1 ? "1 racer" : `${n} racers`;
}

type DistanceRow = {
  id: string;
  event_id: string;
  label: string;
  sort_order: number | null;
  pr_cutoff: string | null;
};

function sortDistancesForDisplay(distances: DistanceRow[]): DistanceRow[] {
  return [...distances].sort((a, b) => {
    const ao = a.sort_order ?? 999;
    const bo = b.sort_order ?? 999;
    if (ao !== bo) return ao - bo;
    return a.label.localeCompare(b.label);
  });
}

export default async function PromoterDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent("/promoter")}`);
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select(
      "user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count",
    )
    .eq("user_id", user.id)
    .single();

  requireActiveMembership(membership as MembershipRow | null, "/promoter");

  const { data: events } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,status,created_at,artwork_url")
    .eq("promoter_id", user.id)
    .order("created_at", { ascending: false });

  const list = events ?? [];
  const eventIds = list.map((e) => e.id);

  const distancesByEvent = new Map<string, DistanceRow[]>();
  if (eventIds.length > 0) {
    const { data: distanceRows } = await supabase
      .from("distances")
      .select("id,event_id,label,sort_order,pr_cutoff")
      .in("event_id", eventIds);

    for (const row of distanceRows ?? []) {
      const d = row as DistanceRow;
      const arr = distancesByEvent.get(d.event_id) ?? [];
      arr.push(d);
      distancesByEvent.set(d.event_id, arr);
    }
  }

  const countByEventDistance = new Map<string, Map<string, number>>();
  if (showEntryCounts && eventIds.length > 0) {
    const { data: countRows, error: countRpcError } = await supabase.rpc(
      "entry_counts_for_events",
      { p_event_ids: eventIds },
    );
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Promoter
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
              Your Events
            </h1>
            <p className="mt-3 max-w-2xl text-pretty text-[#1E3A5F]/75">
              Races you&apos;re hosting. At a glance: distances and entries (when enabled). Open one
              to edit fees and publishing.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/promoter/events/new"
              className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
            >
              Create new event
            </Link>
            <Link
              href="/promoter/bulk-import"
              className="inline-flex items-center justify-center rounded-md border-2 border-[#1E3A5F]/20 px-5 py-3 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
            >
              Bulk import CSV
            </Link>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 py-16 text-center">
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
              No Events Yet
            </h2>
            <p className="mt-2 max-w-sm text-sm text-[#1E3A5F]/60">
              Create your first race to add distances, entry fees, and publish when you&apos;re
              ready.
            </p>
            <Link
              href="/promoter/events/new"
              className="mt-6 inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
            >
              Create event
            </Link>
          </div>
        ) : (
          <ul className="mt-10 space-y-4">
            {list.map((event) => {
              const location = [event.city, event.state].filter(Boolean).join(", ") || "—";
              const published = event.status === "published";
              const locked = event.status === "locked";
              const distances = sortDistancesForDisplay(
                distancesByEvent.get(event.id) ?? [],
              );
              const dCounts = countByEventDistance.get(event.id);
              const artworkUrl = (event as { artwork_url?: string | null }).artwork_url ?? null;

              return (
                <li key={event.id}>
                  <Link
                    href={`/promoter/events/${event.id}/edit`}
                    className="group block rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm transition-all hover:border-[#E87722]/50 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      {artworkUrl ? (
                        <div className="relative aspect-[21/9] w-full shrink-0 overflow-hidden rounded-lg border border-[#1E3A5F]/10 bg-[#fafbfc] sm:aspect-auto sm:h-24 sm:w-32">
                          <Image
                            src={artworkUrl}
                            alt={`${event.name} — race artwork`}
                            fill
                            className="object-cover"
                            sizes="8rem"
                          />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-lg font-semibold text-[#1E3A5F] transition-colors group-hover:text-[#E87722]">
                            {event.name}
                          </h2>
                          {published ? (
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/15">
                              Published
                            </span>
                          ) : locked ? (
                            <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-600/20">
                              Locked
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-[#1E3A5F]/08 px-2 py-0.5 text-xs font-medium text-[#1E3A5F]/80 ring-1 ring-[#1E3A5F]/15">
                              Draft
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#1E3A5F]/70">
                          <span>{formatCalendarDate(event.race_date)}</span>
                          <span>{location}</span>
                        </div>

                        {distances.length > 0 ? (
                          <div
                            className="mt-3 border-t border-[#1E3A5F]/10 pt-3"
                            aria-label={
                              showEntryCounts
                                ? "Entries per distance"
                                : "Distances at this event"
                            }
                          >
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#1E3A5F]/50">
                              {showEntryCounts ? "Field" : "At a glance"}
                            </p>
                            <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                              {distances.map((d) => {
                                const n = dCounts?.get(d.id) ?? 0;
                                return (
                                  <span
                                    key={d.id}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 px-3 py-1 text-xs text-[#1E3A5F]/90 sm:text-sm"
                                  >
                                    <span className="font-medium">{d.label}</span>
                                    {showEntryCounts ? (
                                      <>
                                        <span className="text-[#1E3A5F]/55">·</span>
                                        <span>{racerLabel(n)}</span>
                                      </>
                                    ) : null}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 border-t border-[#1E3A5F]/10 pt-3 text-xs text-[#1E3A5F]/55">
                            No distances yet — add races (distances) in Manage.
                          </p>
                        )}
                      </div>
                      <span className="inline-flex shrink-0 items-center text-sm font-semibold text-[#E87722] group-hover:underline">
                        Manage →
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-10 text-center text-sm text-[#1E3A5F]/70 sm:text-left">
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="font-medium text-[#E87722] underline-offset-2 transition-colors hover:underline"
          >
            Back to Upcoming Races
          </Link>
        </p>
      </main>
    </div>
  );
}
