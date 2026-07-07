import { notFound } from "next/navigation";

import { CHECKPOINT_AUDIO_BUCKET, isValidCheckpointToken } from "@/lib/checkpoints/shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

import { CheckpointScanClient } from "./CheckpointScanClient";

export const dynamic = "force-dynamic";

/**
 * Public checkpoint scan page — what opens when a runner points their phone
 * camera at a QR sign on the course. Kept deliberately light so it loads on
 * one bar of signal in the backcountry.
 */
export default async function CheckpointScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isValidCheckpointToken(token)) notFound();

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const { data: checkpointRaw } = await service
    .from("qr_checkpoints")
    .select("id,event_id,distance_id,name,mile_marker,audio_path,sort_order")
    .eq("token", token)
    .maybeSingle();
  if (!checkpointRaw) notFound();
  const checkpoint = checkpointRaw as {
    id: string;
    event_id: string;
    distance_id: string;
    name: string;
    mile_marker: string | null;
    audio_path: string | null;
    sort_order: number;
  };

  const [{ data: event }, { data: distance }, { data: siblings }] = await Promise.all([
    service.from("events").select("name").eq("id", checkpoint.event_id).maybeSingle(),
    service
      .from("distances")
      .select("label,race_name")
      .eq("id", checkpoint.distance_id)
      .maybeSingle(),
    service
      .from("qr_checkpoints")
      .select("id")
      .eq("distance_id", checkpoint.distance_id)
      .order("sort_order", { ascending: true }),
  ]);
  if (!event || !distance) notFound();

  const number =
    ((siblings ?? []) as Array<{ id: string }>).findIndex((s) => s.id === checkpoint.id) + 1;

  const audioUrl = checkpoint.audio_path
    ? service.storage.from(CHECKPOINT_AUDIO_BUCKET).getPublicUrl(checkpoint.audio_path).data
        .publicUrl
    : null;

  // Logged-in runners auto-connect — no bib prompt needed.
  let knownBib: string | null = null;
  let knownName: string | null = null;
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: myEntries } = await service
      .from("entries")
      .select("id,first_name,last_name,bib,assigned_bib,distance_id")
      .eq("event_id", checkpoint.event_id)
      .eq("user_id", auth.user.id);
    const mine = (myEntries ?? []) as Array<{
      first_name: string | null;
      last_name: string | null;
      bib: string | null;
      assigned_bib: string | null;
      distance_id: string;
    }>;
    const best = mine.find((e) => e.distance_id === checkpoint.distance_id) ?? mine[0];
    if (best) {
      knownBib = best.assigned_bib?.trim() || best.bib?.trim() || null;
      knownName = `${best.first_name ?? ""} ${best.last_name ?? ""}`.trim() || null;
    }
  }

  const dist = distance as { label: string; race_name: string | null };
  const distanceLabel = dist.race_name ? `${dist.race_name} — ${dist.label}` : dist.label;

  return (
    <CheckpointScanClient
      token={token}
      eventId={checkpoint.event_id}
      eventName={(event as { name: string }).name}
      distanceLabel={distanceLabel}
      checkpointNumber={number || 1}
      checkpointName={checkpoint.name}
      mileMarker={checkpoint.mile_marker}
      audioUrl={audioUrl}
      knownBib={knownBib}
      knownName={knownName}
    />
  );
}
