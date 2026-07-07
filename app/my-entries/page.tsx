import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { RaceDayShareLauncher } from "@/components/share/RaceDayShareLauncher";
import { isDistanceEntryOpen } from "@/lib/entry-cutoff";
import { effectiveCheckInWindow } from "@/lib/race-day/logistics";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { DEFAULT_PUBLIC_ROUTE, MY_RESULTS_ROUTE } from "@/lib/routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { WithdrawEntryButton } from "./WithdrawEntryButton";

type EntryRow = {
  id: string;
  created_at: string;
  entry_type: string;
  source_entry_id: string | null;
  event_id: string;
  distance_id: string;
  events: {
    id: string;
    name: string;
    race_date: string;
    city: string | null;
    state: string | null;
    pr_cutoff: string | null;
    status: string;
  } | null;
  distances: {
    id: string;
    label: string;
    is_peer_racing_qualifier: boolean | null;
    pr_cutoff: string | null;
    gun_time: string | null;
    check_in_opens_at: string | null;
    check_in_closes_at: string | null;
    start_location_name: string | null;
    share_sponsor_logo_url: string | null;
  } | null;
};

function embedOne<T extends object>(v: T | T[] | null): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v;
}

function fmtClock(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** One-line race-day summary for an upcoming entry: check-in window, gun, start line. */
function raceDayLine(dist: EntryRow["distances"]): string | null {
  if (!dist) return null;
  const win = effectiveCheckInWindow({
    gun_time: dist.gun_time,
    check_in_opens_at: dist.check_in_opens_at,
    check_in_closes_at: dist.check_in_closes_at,
  });
  const parts: string[] = [];
  const opens = fmtClock(win.opensAt);
  const closes = fmtClock(win.closesAt);
  if (opens && closes) parts.push(`Check-in ${opens}–${closes}`);
  else if (opens) parts.push(`Check-in opens ${opens}`);
  const gun = fmtClock(dist.gun_time);
  if (gun) parts.push(`Gun ${gun}`);
  if (dist.start_location_name?.trim()) parts.push(`Start: ${dist.start_location_name.trim()}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function normalizeEntryRows(raw: unknown[]): EntryRow[] {
  return raw.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      created_at: row.created_at as string,
      entry_type: String(row.entry_type ?? ""),
      source_entry_id: (row.source_entry_id as string | null) ?? null,
      event_id: row.event_id as string,
      distance_id: row.distance_id as string,
      events: embedOne(row.events as EntryRow["events"] | EntryRow["events"][]),
      distances: embedOne(row.distances as EntryRow["distances"] | EntryRow["distances"][]),
    } as EntryRow;
  });
}

export default async function MyEntriesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent("/my-entries")}`);
  }

  const { data: rawRows, error } = await supabase
    .from("entries")
    .select(
      `
      id,
      created_at,
      entry_type,
      source_entry_id,
      event_id,
      distance_id,
      events ( id, name, race_date, city, state, pr_cutoff, status ),
      distances ( id, label, is_peer_racing_qualifier, pr_cutoff, gun_time, check_in_opens_at, check_in_closes_at, start_location_name, share_sponsor_logo_url )
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = normalizeEntryRows(rawRows ?? []);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("first_name,last_name")
    .eq("id", user.id)
    .maybeSingle();
  const runnerName = myProfile
    ? `${(myProfile as { first_name: string | null }).first_name ?? ""} ${
        (myProfile as { last_name: string | null }).last_name ?? ""
      }`.trim() || null
    : null;

  // Published results owned by this racer, keyed by entry so we can link each
  // entry straight to its gamified result page.
  const { data: resultRows } = await supabase
    .from("results")
    .select("id, entry_id")
    .eq("user_id", user.id)
    .eq("published", true);
  const resultIdByEntry = new Map<string, string>();
  for (const row of (resultRows ?? []) as { id: string; entry_id: string | null }[]) {
    if (row.entry_id) resultIdByEntry.set(row.entry_id, row.id);
  }

  const dependentsBySource = new Map<string, number>();
  for (const r of rows) {
    if (r.source_entry_id) {
      dependentsBySource.set(
        r.source_entry_id,
        (dependentsBySource.get(r.source_entry_id) ?? 0) + 1,
      );
    }
  }

  const byEvent = new Map<string, EntryRow[]>();
  for (const r of rows) {
    const eid = r.event_id;
    if (!byEvent.has(eid)) byEvent.set(eid, []);
    byEvent.get(eid)!.push(r);
  }

  const eventOrder = [...byEvent.keys()].sort((a, b) => {
    const da = byEvent.get(a)?.[0]?.events?.race_date ?? "";
    const db = byEvent.get(b)?.[0]?.events?.race_date ?? "";
    return db.localeCompare(da);
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Your Registration
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
          My Entries
        </h1>
        <div className="mt-3 max-w-2xl space-y-3 text-pretty text-[#1E3A5F]/75">
          <p>
            Good luck with your upcoming races! We understand that life happens, and you may need to
            withdraw or make changes to the races you have entered—including the Peer Racing
            Qualifier and any Carry-Over entries. While online registration is open, you can make any
            changes you need.
          </p>
          <p>
            Once online registration closes, if you need to withdraw, please check in on race day or{" "}
            <Link href={DEFAULT_PUBLIC_ROUTE} className="font-semibold text-[#E87722] underline-offset-2 hover:underline">
              open the event page
            </Link>{" "}
            and use <span className="font-semibold text-[#1E3A5F]">Questions about this race?</span> to message the
            organizer.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="mt-10 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] px-6 py-12 text-center">
            <p className="text-[#1E3A5F]/80">You don&apos;t have any entries yet.</p>
            <Link
              href={DEFAULT_PUBLIC_ROUTE}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
            >
              Find a race
            </Link>
          </div>
        ) : (
          <ul className="mt-10 space-y-6">
            {eventOrder.map((eventId) => {
              const list = byEvent.get(eventId) ?? [];
              const ev = list[0]?.events;
              if (!ev) return null;

              const raceDay = ev.race_date ? new Date(ev.race_date) : null;
              const isPast =
                raceDay && !Number.isNaN(raceDay.getTime()) ? raceDay < todayStart : false;
              const location = [ev.city, ev.state].filter(Boolean).join(", ") || "—";

              return (
                <li
                  key={eventId}
                  className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="flex flex-col gap-2 border-b border-[#1E3A5F]/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Link
                        href={`/events/${ev.id}`}
                        className="font-display text-xl font-semibold text-[#1E3A5F] transition-colors hover:text-[#E87722]"
                      >
                        {ev.name}
                      </Link>
                      <p className="mt-1 text-sm text-[#1E3A5F]/70">
                        {formatCalendarDate(ev.race_date)} · {location}
                      </p>
                      {isPast ? (
                        <span className="mt-2 inline-flex rounded-full bg-[#1E3A5F]/08 px-2.5 py-0.5 text-xs font-medium text-[#1E3A5F]/80 ring-1 ring-[#1E3A5F]/15">
                          Past event
                        </span>
                      ) : (
                        <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/15">
                          Upcoming
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <Link
                        href={`/events/${ev.id}`}
                        className="text-sm font-semibold text-[#E87722] underline-offset-2 hover:underline"
                      >
                        Event details
                      </Link>
                      {ev.status === "published" && !isPast ? (
                        <Link
                          href={`/events/${ev.id}#contact`}
                          className="text-sm font-semibold text-[#1E3A5F]/80 underline-offset-2 hover:text-[#E87722] hover:underline"
                        >
                          Contact organizer
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <ul className="mt-4 space-y-4">
                    {list.map((entry) => {
                      const dist = entry.distances;
                      const evPr = ev.pr_cutoff;
                      const dPr = dist?.pr_cutoff ?? null;
                      const open = isDistanceEntryOpen(evPr, dPr);
                      const sourceEntry = entry.source_entry_id
                        ? byId.get(entry.source_entry_id)
                        : null;
                      const sourceLabel = sourceEntry?.distances?.label ?? "Qualifier";

                      const isQualifierPrimary =
                        entry.entry_type === "primary" &&
                        dist?.is_peer_racing_qualifier === true;

                      let kindLabel = "Primary entry";
                      if (entry.entry_type === "roll_over") {
                        kindLabel = `Qualifier Carry-Over (from ${sourceLabel} → ${dist?.label ?? "this race"})`;
                      } else if (isQualifierPrimary) {
                        kindLabel = "Peer Racing Qualifier (primary)";
                      }

                      const hasLinkedRollOvers =
                        entry.entry_type === "primary" &&
                        (dependentsBySource.get(entry.id) ?? 0) > 0;

                      const resultId = resultIdByEntry.get(entry.id);

                      return (
                        <li
                          key={entry.id}
                          className="rounded-lg border border-[#1E3A5F]/10 bg-[#fafbfc] px-4 py-3"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-semibold text-[#1E3A5F]">Race: {dist?.label ?? "—"}</p>
                              <p className="mt-1 text-sm text-[#1E3A5F]/75">{kindLabel}</p>
                              {!isPast && raceDayLine(dist) ? (
                                <p className="mt-1.5 inline-flex flex-wrap items-center gap-1 rounded-md bg-[#E87722]/10 px-2 py-1 text-xs font-medium text-[#1E3A5F]">
                                  <span aria-hidden>🏁</span> {raceDayLine(dist)}{" "}
                                  <Link
                                    href={`/events/${ev.id}#race-day`}
                                    className="font-semibold text-[#E87722] underline-offset-2 hover:underline"
                                  >
                                    Race day sheet →
                                  </Link>
                                </p>
                              ) : null}
                              {!isPast && dist ? (
                                <div>
                                  <RaceDayShareLauncher
                                    eventName={ev.name}
                                    distanceLabel={dist.label}
                                    runnerName={runnerName}
                                    sponsorLogoUrl={
                                      dist.share_sponsor_logo_url ??
                                      list.find((e) => e.distances?.share_sponsor_logo_url)
                                        ?.distances?.share_sponsor_logo_url ??
                                      null
                                    }
                                  />
                                </div>
                              ) : null}
                              <p className="mt-1 text-xs text-[#1E3A5F]/55">
                                Entered{" "}
                                {new Date(entry.created_at).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:max-w-xs sm:items-end sm:text-right">
                              {resultId ? (
                                <Link
                                  href={`${MY_RESULTS_ROUTE}/${resultId}`}
                                  className="inline-flex items-center justify-center gap-1 rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
                                >
                                  View result →
                                </Link>
                              ) : null}
                              <WithdrawEntryButton
                                entryId={entry.id}
                                distanceLabel={dist?.label?.trim() ?? ""}
                                disabled={!open}
                                hasLinkedRollOvers={hasLinkedRollOvers}
                              />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
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
