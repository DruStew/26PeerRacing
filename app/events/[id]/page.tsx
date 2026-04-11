import Link from "next/link";
import { notFound } from "next/navigation";

import { FlyerLightbox } from "@/components/events/FlyerLightbox";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";
import { areEntriesOpenForEvent } from "@/lib/event-entry-status";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatEntryFee(cents: number): string {
  return cents === 0 ? "$0" : `$${(cents / 100).toFixed(2)}`;
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,artwork_url")
    .eq("id", id)
    .single();

  if (error || !event) {
    notFound();
  }

  const { data: distances } = await supabase
    .from("distances")
    .select("id,label,gun_time,entry_fee_cents,pr_cutoff")
    .eq("event_id", id)
    .order("gun_time", { ascending: true, nullsFirst: true });

  const distanceRows = distances ?? [];
  const entriesOpen = areEntriesOpenForEvent(
    null,
    distanceRows.map((d) => ({
      pr_cutoff: d.pr_cutoff ?? null,
    })),
  );

  const location = [event.city, event.state].filter(Boolean).join(", ") || "—";
  const artworkUrl = (event as { artwork_url?: string | null }).artwork_url ?? null;

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href={DEFAULT_PUBLIC_ROUTE}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Upcoming races
        </Link>

        {artworkUrl ? (
          <FlyerLightbox
            src={artworkUrl}
            alt={`${event.name} — race artwork`}
            variant="detail"
          />
        ) : null}

        <header className={`border-b border-[#1E3A5F]/10 pb-8 ${artworkUrl ? "mt-8" : "mt-6"}`}>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            {event.name}
          </h1>
          {!entriesOpen ? (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-[#1E3A5F]/20 bg-[#1E3A5F] px-4 py-3.5 text-center shadow-md sm:px-5 sm:text-left"
            >
              <p className="font-display text-lg font-bold leading-snug text-white sm:text-xl">
                Entries for This Race Are Closed
              </p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#1E3A5F]/80">
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
              {location}
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
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Race day: {formatCalendarDate(event.race_date)}
            </span>
          </div>
        </header>

        {distanceRows.length > 0 ? (
          <section className="mt-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6">
              <div>
                <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Races</h2>
                <p className="mt-1 text-sm text-[#1E3A5F]/70">
                  Distances and entry fees for this event.
                </p>
              </div>
              {!entriesOpen ? (
                <p
                  className="shrink-0 rounded-md border border-[#1E3A5F]/25 bg-[#1E3A5F]/10 px-3 py-2 text-center font-display text-sm font-bold text-[#1E3A5F] sm:max-w-md sm:text-base"
                  aria-hidden="true"
                >
                  Entries for This Race Are Closed
                </p>
              ) : null}
            </div>
            <ul className="mt-4 space-y-3">
              {distanceRows.map((d) => {
                const feeCents = (d as { entry_fee_cents?: number }).entry_fee_cents ?? 0;
                const gun = (d as { gun_time?: string | null }).gun_time;
                const prCutoff = (d as { pr_cutoff?: string | null }).pr_cutoff ?? null;
                const scheduleParts = [
                  gun ? `Gun: ${formatDateTime(gun)}` : null,
                  prCutoff ? `Entry deadline: ${formatDateTime(prCutoff)}` : null,
                ].filter(Boolean);
                return (
                  <li
                    key={d.id}
                    className="rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div>
                      <p className="font-display text-lg font-semibold text-[#1E3A5F]">{d.label}</p>
                      {scheduleParts.length > 0 ? (
                        <p className="mt-1 text-sm text-[#1E3A5F]/70">{scheduleParts.join(" · ")}</p>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[#1E3A5F] sm:mt-0 sm:text-base">
                      Entry: {formatEntryFee(feeCents)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          {entriesOpen ? (
            <Link
              href={`/events/${event.id}/enter`}
              className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
            >
              Enter race
            </Link>
          ) : (
            <span
              className="inline-flex cursor-not-allowed items-center justify-center rounded-md border border-[#1E3A5F]/15 bg-[#1E3A5F]/08 px-6 py-3 text-sm font-semibold text-[#1E3A5F]/40"
              aria-disabled="true"
              title="Entry deadline has passed for this event"
            >
              Enter race
            </span>
          )}
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-6 py-3 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
          >
            Back to Upcoming Races
          </Link>
        </div>
      </main>
    </div>
  );
}
