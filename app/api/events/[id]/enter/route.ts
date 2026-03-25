import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isProfileComplete } from "@/lib/profile";
import { isMembershipActive } from "@/lib/membership";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await context.params;
  const formData = await request.formData();

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "You must be signed in to enter a race" },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,dob,sex,phone,email")
    .eq("id", user.id)
    .single();

  if (!isProfileComplete(profile as { first_name: string | null; last_name: string | null; dob: string | null; sex: string | null; email: string | null } | null)) {
    return NextResponse.json(
      { ok: false, error: "Complete your profile before entering" },
      { status: 403 },
    );
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
    .eq("user_id", user.id)
    .single();
  if (!isMembershipActive(membership as { user_id: string; status: string; membership_start_at: string | null; membership_end_at: string | null } | null)) {
    return NextResponse.json(
      { ok: false, error: "Active membership required", redirect: "/membership/renew" },
      { status: 403 },
    );
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,pr_cutoff,promoter_id")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json(
      { ok: false, error: "Event not found" },
      { status: 404 },
    );
  }

  const eventCutoff = event.pr_cutoff ? new Date(event.pr_cutoff) : null;
  const defaultCutoff =
    eventCutoff && !Number.isNaN(eventCutoff.getTime()) ? eventCutoff : null;

  const primaryDistanceIds = formData
    .getAll("enter_distance")
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (primaryDistanceIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Select at least one race to enter" },
      { status: 400 },
    );
  }

  const { data: allDistances } = await supabase
    .from("distances")
    .select("id,pr_cutoff,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here")
    .eq("event_id", eventId);

  const distances = (allDistances ?? []).filter((d) => primaryDistanceIds.includes(d.id));
  const validDistanceIds = new Set((allDistances ?? []).map((d) => d.id));
  const qualifierId = (allDistances ?? []).find(
    (d) => (d as { is_peer_racing_qualifier?: boolean }).is_peer_racing_qualifier && (d as { allow_roll_over_from_qualifier?: boolean }).allow_roll_over_from_qualifier,
  )?.id;
  const allowedRollOverTargets = new Set(
    (allDistances ?? [])
      .filter((d) => (d as { allow_qualifier_split_to_roll_over_here?: boolean }).allow_qualifier_split_to_roll_over_here)
      .map((d) => d.id),
  );
  const distanceCutoffs = new Map(
    (allDistances ?? []).map((d) => [d.id, d.pr_cutoff ? new Date(d.pr_cutoff) : null]),
  );

  const now = new Date();
  for (const did of primaryDistanceIds) {
    if (!validDistanceIds.has(did)) {
      return NextResponse.json(
        { ok: false, error: "Invalid distance for this event" },
        { status: 400 },
      );
    }
    const cutoff = distanceCutoffs.get(did) ?? defaultCutoff;
    if (cutoff != null && !Number.isNaN(cutoff.getTime()) && now > cutoff) {
      return NextResponse.json(
        { ok: false, error: "Entry cutoff has passed for one or more races" },
        { status: 403 },
      );
    }
  }

  const { data: existingEntries } = await supabase
    .from("entries")
    .select("distance_id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .in("distance_id", primaryDistanceIds);

  if (existingEntries && existingEntries.length > 0) {
    return NextResponse.json(
      { ok: false, error: "You already have an entry for one or more of these races" },
      { status: 409 },
    );
  }

  const phoneVal = user.phone ?? (profile as { phone?: string })?.phone ?? user.email ?? "";
  const firstName = (profile as { first_name?: string })?.first_name?.trim() ?? "";
  const lastName = (profile as { last_name?: string })?.last_name?.trim() ?? "";
  const email = (profile as { email?: string })?.email?.trim() ?? user.email ?? "";
  const dob = (profile as { dob?: string })?.dob ?? "";
  const sex = (profile as { sex?: string })?.sex ?? "";
  const bib = String(formData.get("bib") ?? "").trim() || null;

  const entryKind = "free";
  const basePayload = {
    event_id: eventId,
    user_id: user.id,
    first_name: firstName,
    last_name: lastName,
    phone: phoneVal,
    email,
    dob,
    sex,
    bib,
    entry_kind: entryKind,
    eligible: true,
  };

  const primaryEntryByDistance = new Map<string, { id: string; created_at: string }>();

  for (const distanceId of primaryDistanceIds) {
    const dist = distances?.find((d) => d.id === distanceId);
    const cutoffSnapshot = dist?.pr_cutoff ?? event.pr_cutoff;
    const { data: entry, error: insertError } = await supabase
      .from("entries")
      .insert({
        ...basePayload,
        distance_id: distanceId,
        entry_type: "primary",
        source_entry_id: null,
        cutoff_snapshot: cutoffSnapshot ?? now.toISOString(),
      })
      .select("id,created_at")
      .single();

    if (insertError || !entry) {
      return NextResponse.json(
        { ok: false, error: insertError?.message ?? "Insert failed" },
        { status: 400 },
      );
    }
    primaryEntryByDistance.set(distanceId, { id: entry.id, created_at: entry.created_at });
  }

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || value !== "1") continue;
    const m = key.match(/^roll_over_(.+)_from_(.+)$/);
    if (!m) continue;
    const [, targetDistanceId, sourceDistanceId] = m;
    if (sourceDistanceId !== qualifierId || !allowedRollOverTargets.has(targetDistanceId)) continue;
    const sourceEntry = primaryEntryByDistance.get(sourceDistanceId);
    if (!sourceEntry) continue;

    const { data: existingRoll } = await supabase
      .from("entries")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .eq("distance_id", targetDistanceId)
      .maybeSingle();
    if (existingRoll) continue;

    const dist = allDistances?.find((d) => d.id === targetDistanceId);
    const cutoffSnapshot = dist?.pr_cutoff ?? event.pr_cutoff;
    await supabase.from("entries").insert({
      ...basePayload,
      distance_id: targetDistanceId,
      entry_type: "roll_over",
      source_entry_id: sourceEntry.id,
      cutoff_snapshot: cutoffSnapshot ?? now.toISOString(),
    });
  }

  const firstEntry = primaryEntryByDistance.get(primaryDistanceIds[0]!);
  const redirectUrl = new URL(`/events/${eventId}/enter`, request.url);
  redirectUrl.searchParams.set("success", "1");
  redirectUrl.searchParams.set("created_at", firstEntry?.created_at ?? "");

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
