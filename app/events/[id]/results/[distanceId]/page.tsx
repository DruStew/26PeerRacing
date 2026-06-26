import Link from "next/link";
import { notFound } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { PublicResultsView } from "@/components/results/PublicResultsView";
import { CourseMapLazy } from "@/components/maps/CourseMapLazy";
import { DirectionsButton } from "@/components/maps/DirectionsButton";
import {
  courseLengthMeters,
  metersToKm,
  metersToMiles,
  type CourseGeoJSON,
} from "@/lib/mapbox/config";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { loadPublicResults } from "@/lib/results-public";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublicRaceResultsPage({
  params,
}: {
  params: Promise<{ id: string; distanceId: string }>;
}) {
  const { id, distanceId } = await params;
  const supabase = await createServerSupabaseClient();

  const results = await loadPublicResults(supabase, id, distanceId);
  if (!results) notFound();

  const location = [results.city, results.state].filter(Boolean).join(", ");

  const [{ data: distanceRow }, { data: eventRow }] = await Promise.all([
    supabase.from("distances").select("course_geojson").eq("id", distanceId).maybeSingle(),
    supabase
      .from("events")
      .select("venue_name,venue_lat,venue_lng")
      .eq("id", id)
      .maybeSingle(),
  ]);

  const course =
    ((distanceRow as { course_geojson?: CourseGeoJSON | null } | null)?.course_geojson ?? null) as
      | CourseGeoJSON
      | null;
  const courseMeters = courseLengthMeters(course);
  const hasCourse = courseMeters > 0;
  const venueLat = (eventRow as { venue_lat?: number | null } | null)?.venue_lat ?? null;
  const venueLng = (eventRow as { venue_lng?: number | null } | null)?.venue_lng ?? null;
  const venueName = (eventRow as { venue_name?: string | null } | null)?.venue_name ?? null;
  const hasVenue = venueLat != null && venueLng != null;

  return (
    <div className="min-h-screen bg-[#fafbfc] font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href={`/events/${results.eventId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {results.eventName}
        </Link>

        <header className="mt-6 border-b border-[#1E3A5F]/10 pb-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-[#E87722]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#E87722]">
            Official results
          </p>
          <h1 className="font-display mt-3 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            {results.eventName} — {results.distanceLabel}
          </h1>
          <p className="mt-2 text-sm text-[#1E3A5F]/70">
            {results.raceDate ? formatCalendarDate(results.raceDate) : null}
            {results.raceDate && location ? " · " : ""}
            {location}
            {results.publishedAt
              ? ` · Published ${new Date(results.publishedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}`
              : ""}
          </p>
        </header>

        {hasCourse ? (
          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Course</h2>
                <p className="mt-1 text-sm text-[#1E3A5F]/70">
                  {metersToMiles(courseMeters).toFixed(2)} mi ({metersToKm(courseMeters).toFixed(2)} km)
                </p>
              </div>
              {hasVenue ? (
                <DirectionsButton
                  lat={venueLat as number}
                  lng={venueLng as number}
                  label={venueName ?? results.eventName}
                />
              ) : null}
            </div>
            <div className="mt-4">
              <CourseMapLazy
                course={course}
                venue={
                  hasVenue
                    ? { lat: venueLat as number, lng: venueLng as number, label: venueName ?? results.eventName }
                    : null
                }
                heightClass="h-72"
              />
            </div>
          </section>
        ) : null}

        <div className="mt-8">
          <PublicResultsView results={results} />
        </div>
      </main>
    </div>
  );
}
