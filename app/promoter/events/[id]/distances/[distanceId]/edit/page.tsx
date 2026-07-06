import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { CourseEditorLazy } from "@/components/maps/CourseEditorLazy";
import { StartAidStationsEditorLazy } from "@/components/maps/StartAidStationsEditorLazy";
import type { CourseGeoJSON } from "@/lib/mapbox/config";
import { DistanceTierCheckboxes } from "@/components/promoter/DistanceTierCheckboxes";
import { GunCheckInFields } from "@/components/promoter/GunCheckInFields";
import { formatDistanceDisplay } from "@/lib/distance-display";
import { parseDistanceTierFlagsFromForm } from "@/lib/membership-tiers";
import {
  datetimeLocalInputValueOrRaceDayDefault,
  toDatetimeLocalInputValue,
} from "@/lib/datetime-local";
import { effectiveCheckInWindow } from "@/lib/race-day/logistics";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

const selectClass = `${inputClass} cursor-pointer`;

export default async function EditDistancePage({
  params,
}: {
  params: Promise<{ id: string; distanceId: string }>;
}) {
  const { id: eventId, distanceId } = await params;
  const returnUrl = `/promoter/events/${eventId}/distances/${distanceId}/edit`;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,name,race_date,venue_lat,venue_lng,city,state")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    notFound();
  }

  const { data: distance, error: distanceError } = await supabase
    .from("distances")
    .select(
      "id,label,race_name,gun_time,pr_cutoff,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here,allow_pacers,pacer_fee_cents,entry_fee_cents,course_geojson,allow_free_tier,allow_pr_team_tier,allow_top_tier,check_in_opens_at,check_in_closes_at,allow_walk_ups,walk_up_fee_cents,start_location_name,start_location_address,start_lat,start_lng,course_cutoff_at,packet_pickup_info,additional_notes",
    )
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .single();

  if (distanceError || !distance) {
    notFound();
  }

  const { data: qualifierDistance } = await supabase
    .from("distances")
    .select("id,label,race_name")
    .eq("event_id", eventId)
    .eq("is_peer_racing_qualifier", true)
    .maybeSingle();

  const distanceWithExtras = distance as typeof distance & {
    sort_order?: number;
    gun_time?: string;
    pr_cutoff?: string;
    entry_fee_cents?: number;
  };
  const entryFeeDollarsDefault = ((distanceWithExtras.entry_fee_cents ?? 0) / 100).toFixed(2);
  const raceDay = (event as { race_date?: string | null }).race_date ?? null;
  const gunTimeDefault = datetimeLocalInputValueOrRaceDayDefault(
    distanceWithExtras.gun_time ?? null,
    raceDay,
    8,
    0,
  );
  const isThisQualifier =
    (distance as { is_peer_racing_qualifier?: boolean }).is_peer_racing_qualifier === true;
  const otherIsQualifier = qualifierDistance && qualifierDistance.id !== distanceId;

  const logistics = distance as {
    check_in_opens_at?: string | null;
    check_in_closes_at?: string | null;
    allow_walk_ups?: boolean | null;
    walk_up_fee_cents?: number | null;
    start_location_name?: string | null;
    start_location_address?: string | null;
    start_lat?: number | null;
    start_lng?: number | null;
    course_cutoff_at?: string | null;
    packet_pickup_info?: string | null;
    additional_notes?: string | null;
  };
  const checkInWindow = effectiveCheckInWindow({
    gun_time: distanceWithExtras.gun_time ?? null,
    check_in_opens_at: logistics.check_in_opens_at ?? null,
    check_in_closes_at: logistics.check_in_closes_at ?? null,
  });
  const checkInOpensDefault = toDatetimeLocalInputValue(checkInWindow.opensAt);
  const checkInClosesDefault = toDatetimeLocalInputValue(checkInWindow.closesAt);
  const walkUpFeeDollarsDefault =
    logistics.walk_up_fee_cents != null ? (logistics.walk_up_fee_cents / 100).toFixed(2) : "";
  const courseCutoffDefault = toDatetimeLocalInputValue(logistics.course_cutoff_at ?? null);

  const { data: aidStationsRaw } = await supabase
    .from("aid_stations")
    .select("name,mile_marker,lat,lng,drop_bags,sort_order")
    .eq("distance_id", distanceId)
    .order("sort_order", { ascending: true });

  const updateDistance = async (formData: FormData) => {
    "use server";

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }

    const label = String(formData.get("label") ?? "").trim();
    const raceNameRaw = String(formData.get("race_name") ?? "").trim();
    const raceName = raceNameRaw || null;
    const gunTimeRaw = formData.get("gun_time");
    const gunTime =
      gunTimeRaw && String(gunTimeRaw).trim()
        ? new Date(String(gunTimeRaw).trim()).toISOString()
        : null;
    const isQualifier = formData.get("is_peer_racing_qualifier") === "1";
    const allowRollOverFrom =
      String(formData.get("allow_roll_over_from_qualifier") ?? "").toLowerCase() === "yes";
    const allowQualifierRollOverHere =
      String(formData.get("allow_qualifier_split_to_roll_over_here") ?? "").toLowerCase() === "yes";
    const allowPacers = formData.get("allow_pacers") === "1";
    const pacerFeeDollarsRaw = formData.get("pacer_fee_dollars");
    const pacerFeeCents = (() => {
      if (pacerFeeDollarsRaw == null || String(pacerFeeDollarsRaw).trim() === "") return 0;
      const d = parseFloat(String(pacerFeeDollarsRaw).replace(/[$,\s]/g, ""));
      if (Number.isNaN(d) || d < 0) return 0;
      return Math.round(d * 100);
    })();
    const entryFeeDollarsRaw = formData.get("entry_fee_dollars");
    const entryFeeCents = (() => {
      if (entryFeeDollarsRaw == null || String(entryFeeDollarsRaw).trim() === "") return 0;
      const d = parseFloat(String(entryFeeDollarsRaw).replace(/[$,\s]/g, ""));
      if (Number.isNaN(d) || d < 0) return 0;
      return Math.round(d * 100);
    })();

    const tierFlags = parseDistanceTierFlagsFromForm(formData);

    const parseDatetime = (field: string): string | null => {
      const raw = formData.get(field);
      if (raw == null || String(raw).trim() === "") return null;
      const d = new Date(String(raw).trim());
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };

    const allowWalkUps = formData.get("allow_walk_ups") === "1";
    const walkUpFeeDollarsRaw = formData.get("walk_up_fee_dollars");
    const walkUpFeeCents = (() => {
      if (walkUpFeeDollarsRaw == null || String(walkUpFeeDollarsRaw).trim() === "") return null;
      const d = parseFloat(String(walkUpFeeDollarsRaw).replace(/[$,\s]/g, ""));
      if (Number.isNaN(d) || d < 0) return null;
      return Math.round(d * 100);
    })();

    const { error } = await supabase
      .from("distances")
      .update({
        label,
        race_name: raceName,
        gun_time: gunTime,
        // Entry deadline is retired — online registration closes at the event level;
        // race-day access is governed by the check-in window + walk-up toggle.
        pr_cutoff: null,
        is_peer_racing_qualifier: isQualifier,
        allow_roll_over_from_qualifier: isQualifier ? allowRollOverFrom : false,
        allow_qualifier_split_to_roll_over_here: !isQualifier ? allowQualifierRollOverHere : false,
        allow_pacers: allowPacers,
        pacer_fee_cents: pacerFeeCents,
        entry_fee_cents: entryFeeCents,
        check_in_opens_at: parseDatetime("check_in_opens_at"),
        check_in_closes_at: parseDatetime("check_in_closes_at"),
        allow_walk_ups: allowWalkUps,
        walk_up_fee_cents: allowWalkUps ? walkUpFeeCents : null,
        course_cutoff_at: parseDatetime("course_cutoff_at"),
        packet_pickup_info: String(formData.get("packet_pickup_info") ?? "").trim() || null,
        additional_notes: String(formData.get("additional_notes") ?? "").trim() || null,
        ...tierFlags,
      })
      .eq("id", distanceId)
      .eq("event_id", eventId);

    if (error) {
      throw new Error(error.message);
    }

    redirect(`/promoter/events/${eventId}/edit`);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href={`/promoter/events/${eventId}/edit`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to event
        </Link>

        <div className="mt-6 border-b border-[#1E3A5F]/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
            Edit Distance
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            {formatDistanceDisplay({
              label: distance.label,
              race_name: (distance as { race_name?: string | null }).race_name,
            })}
          </h1>
          <p className="mt-2 text-sm text-[#1E3A5F]/75">{event.name}</p>
        </div>

        <div className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm sm:p-8">
          <form action={updateDistance} className="space-y-5">
            <div>
              <label htmlFor="race_name" className="text-sm font-medium text-[#1E3A5F]">
                Individual race name{" "}
                <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
              </label>
              <input
                id="race_name"
                name="race_name"
                defaultValue={(distance as { race_name?: string | null }).race_name ?? ""}
                className={inputClass}
                placeholder="Kids Run"
              />
            </div>

            <div>
              <label htmlFor="label" className="text-sm font-medium text-[#1E3A5F]">
                Race distance
              </label>
              <input
                id="label"
                name="label"
                defaultValue={distance.label}
                required
                className={inputClass}
                placeholder="1 mile"
              />
            </div>

            <DistanceTierCheckboxes
              initialFree={(distance as { allow_free_tier?: boolean }).allow_free_tier === true}
              initialPrTeam={(distance as { allow_pr_team_tier?: boolean }).allow_pr_team_tier !== false}
              initialTopTier={(distance as { allow_top_tier?: boolean }).allow_top_tier !== false}
            />

            <div>
              <label htmlFor="entry_fee_dollars" className="text-sm font-medium text-[#1E3A5F]">
                Entry fee ($)
              </label>
              <input
                id="entry_fee_dollars"
                name="entry_fee_dollars"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={entryFeeDollarsDefault}
                className={inputClass}
              />
            </div>

            <GunCheckInFields
              defaultGunTime={gunTimeDefault}
              defaultCheckInOpens={checkInOpensDefault}
              defaultCheckInCloses={checkInClosesDefault}
              defaultAllowWalkUps={logistics.allow_walk_ups !== false}
              defaultWalkUpFeeDollars={walkUpFeeDollarsDefault}
              inputClass={inputClass}
            />

            <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
              <p className="font-display text-base font-semibold text-[#1E3A5F]">
                Course Cutoff & Packet Pickup
              </p>
              <div className="mt-4">
                <label htmlFor="course_cutoff_at" className="text-sm font-medium text-[#1E3A5F]">
                  Course cutoff{" "}
                  <span className="font-normal text-[#1E3A5F]/55">
                    (optional — final on-course cutoff, mostly for ultras)
                  </span>
                </label>
                <input
                  id="course_cutoff_at"
                  name="course_cutoff_at"
                  type="datetime-local"
                  defaultValue={courseCutoffDefault}
                  className={inputClass}
                />
              </div>
              <div className="mt-4">
                <label htmlFor="packet_pickup_info" className="text-sm font-medium text-[#1E3A5F]">
                  Packet pickup <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
                </label>
                <textarea
                  id="packet_pickup_info"
                  name="packet_pickup_info"
                  rows={3}
                  defaultValue={logistics.packet_pickup_info ?? ""}
                  placeholder="Fri 1–6 PM, Sturgis RV Park & Campground. Drop bags due by 6 PM."
                  className={inputClass}
                />
              </div>
              <div className="mt-4">
                <label htmlFor="additional_notes" className="text-sm font-medium text-[#1E3A5F]">
                  Additional notes for this race{" "}
                  <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
                </label>
                <textarea
                  id="additional_notes"
                  name="additional_notes"
                  rows={4}
                  defaultValue={logistics.additional_notes ?? ""}
                  placeholder="Buses leave Woodle Field at 6 AM. First and last mile are paved; the rest is dirt."
                  className={inputClass}
                />
              </div>
            </div>

            <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
              <p className="font-display text-base font-semibold text-[#1E3A5F]">
                Peer Racing Qualifier
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#1E3A5F]/70">
                You may have only one Qualifier per event. Runners can enter the Qualifier and
                optionally Carry-Over their split to other races you allow below.
              </p>
              {isThisQualifier ? (
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-[#1E3A5F]">This race is the Peer Racing Qualifier.</p>
                  <div>
                    <label
                      htmlFor="allow_roll_over_from_qualifier"
                      className="text-sm font-medium text-[#1E3A5F]"
                    >
                      Allow Carry-Over splits from this Qualifier?
                    </label>
                    <select
                      id="allow_roll_over_from_qualifier"
                      name="allow_roll_over_from_qualifier"
                      className={selectClass}
                      defaultValue={
                        (distance as { allow_roll_over_from_qualifier?: boolean })
                          .allow_roll_over_from_qualifier
                          ? "yes"
                          : "no"
                      }
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <input type="hidden" name="is_peer_racing_qualifier" value="1" />
                </div>
              ) : otherIsQualifier ? (
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-[#1E3A5F]">
                    This event&apos;s Peer Racing Qualifier is{" "}
                    <strong className="font-semibold">
                      {formatDistanceDisplay({
                        label: qualifierDistance!.label,
                        race_name: (qualifierDistance as { race_name?: string | null }).race_name,
                      })}
                    </strong>.
                  </p>
                  <div>
                    <label
                      htmlFor="allow_qualifier_split_to_roll_over_here"
                      className="text-sm font-medium text-[#1E3A5F]"
                    >
                      Allow Carry-Over from the Qualifier into this race?
                    </label>
                    <select
                      id="allow_qualifier_split_to_roll_over_here"
                      name="allow_qualifier_split_to_roll_over_here"
                      className={selectClass}
                      defaultValue={
                        (distance as { allow_qualifier_split_to_roll_over_here?: boolean })
                          .allow_qualifier_split_to_roll_over_here
                          ? "yes"
                          : "no"
                      }
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#1E3A5F]/70">
                  No Qualifier set for this event yet. Set one on another distance to enable
                  Carry-Over options here.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
              <p className="font-display text-base font-semibold text-[#1E3A5F]">Pacers</p>
              <p className="mt-2 text-sm text-[#1E3A5F]/70">
                Runners can request a registered Peer Racing member as pacer. Pacers do not count in
                standings or payouts.
              </p>
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[#1E3A5F]">
                <input
                  type="checkbox"
                  name="allow_pacers"
                  value="1"
                  defaultChecked={(distance as { allow_pacers?: boolean }).allow_pacers === true}
                  className="h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
                />
                Allow pacers for this distance
              </label>
              <div className="mt-4">
                <label htmlFor="pacer_fee_dollars" className="text-sm font-medium text-[#1E3A5F]">
                  Pacer Fee (in whole dollars. 0 if no pacer fee)
                </label>
                <input
                  id="pacer_fee_dollars"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  name="pacer_fee_dollars"
                  defaultValue={String(
                    ((distance as { pacer_fee_cents?: number }).pacer_fee_cents ?? 0) / 100,
                  )}
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 sm:w-auto"
            >
              Save distance
            </button>
          </form>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">
            Start Line & Aid Stations
          </h2>
          <p className="mt-1 text-sm text-[#1E3A5F]/70">
            Pin where this race starts if it differs from the event venue (point-to-point races),
            and drop a pin for each aid station. Short races can skip this entirely.
          </p>
          <div className="mt-6">
            <StartAidStationsEditorLazy
              eventId={eventId}
              distanceId={distanceId}
              initialStart={{
                name: logistics.start_location_name ?? "",
                address: logistics.start_location_address ?? "",
                lat: logistics.start_lat ?? null,
                lng: logistics.start_lng ?? null,
              }}
              initialStations={(aidStationsRaw ?? []).map((s) => ({
                name: (s as { name: string }).name,
                mile_marker: (s as { mile_marker?: string | null }).mile_marker ?? null,
                lat: (s as { lat?: number | null }).lat ?? null,
                lng: (s as { lng?: number | null }).lng ?? null,
                drop_bags: (s as { drop_bags?: boolean }).drop_bags === true,
              }))}
              venue={
                (event as { venue_lat?: number | null }).venue_lat != null &&
                (event as { venue_lng?: number | null }).venue_lng != null
                  ? {
                      lat: (event as { venue_lat: number }).venue_lat,
                      lng: (event as { venue_lng: number }).venue_lng,
                    }
                  : null
              }
              searchBias={{
                city: (event as { city?: string | null }).city,
                state: (event as { state?: string | null }).state,
              }}
            />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Course Map</h2>
          <p className="mt-1 text-sm text-[#1E3A5F]/70">
            Draw this distance&apos;s route. The course and its measured length show on the public
            event and results pages for racers and followers.
          </p>
          <div className="mt-6">
            <CourseEditorLazy
              eventId={eventId}
              distanceId={distanceId}
              initialCourse={
                ((distance as { course_geojson?: CourseGeoJSON | null }).course_geojson ?? null) as
                  | CourseGeoJSON
                  | null
              }
              venue={
                (event as { venue_lat?: number | null }).venue_lat != null &&
                (event as { venue_lng?: number | null }).venue_lng != null
                  ? {
                      lat: (event as { venue_lat: number }).venue_lat,
                      lng: (event as { venue_lng: number }).venue_lng,
                    }
                  : null
              }
            />
          </div>
        </section>
      </main>
    </div>
  );
}
