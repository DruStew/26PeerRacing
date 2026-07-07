import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ALLOWED_AUDIO_MIME,
  CHECKPOINT_AUDIO_BUCKET,
  MAX_AUDIO_BYTES,
} from "@/lib/checkpoints/shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

async function gate(eventId: string, supabase: SupabaseClient) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: event, error } = await supabase
    .from("events")
    .select("id,promoter_id")
    .eq("id", eventId)
    .single();
  if (error || !event) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 }) };
  }
  if ((event as { promoter_id: string }).promoter_id === uid) return { ok: true as const };
  const { data: admin } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (admin) return { ok: true as const };
  return { ok: false as const, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
}

async function loadCheckpoint(service: SupabaseClient, eventId: string, distanceId: string, checkpointId: string) {
  const { data } = await service
    .from("qr_checkpoints")
    .select("id,audio_path")
    .eq("id", checkpointId)
    .eq("event_id", eventId)
    .eq("distance_id", distanceId)
    .maybeSingle();
  return data as { id: string; audio_path: string | null } | null;
}

/** POST — upload/replace the audio story for one checkpoint. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; distanceId: string; checkpointId: string }> },
) {
  const { id: eventId, distanceId, checkpointId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const checkpoint = await loadCheckpoint(service, eventId, distanceId, checkpointId);
  if (!checkpoint) {
    return NextResponse.json({ ok: false, error: "Checkpoint not found." }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Choose an audio file." }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, error: "Audio must be 15 MB or smaller." }, { status: 400 });
  }
  const ext = ALLOWED_AUDIO_MIME.get(file.type);
  if (!ext) {
    return NextResponse.json({ ok: false, error: "Use MP3, M4A, AAC, WAV, or OGG audio." }, { status: 400 });
  }

  const storagePath = `${eventId}/${checkpointId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await service.storage
    .from(CHECKPOINT_AUDIO_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });
  if (uploadErr) {
    return NextResponse.json({ ok: false, error: uploadErr.message }, { status: 500 });
  }

  // Extension may have changed (mp3 -> m4a); clean up the old object.
  if (checkpoint.audio_path && checkpoint.audio_path !== storagePath) {
    await service.storage.from(CHECKPOINT_AUDIO_BUCKET).remove([checkpoint.audio_path]);
  }

  const { error: updateErr } = await service
    .from("qr_checkpoints")
    .update({ audio_path: storagePath })
    .eq("id", checkpointId);
  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  const { data: pub } = service.storage.from(CHECKPOINT_AUDIO_BUCKET).getPublicUrl(storagePath);
  return NextResponse.json({ ok: true, audio_url: pub.publicUrl });
}

/** DELETE — remove the audio story from one checkpoint. */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; distanceId: string; checkpointId: string }> },
) {
  const { id: eventId, distanceId, checkpointId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const checkpoint = await loadCheckpoint(service, eventId, distanceId, checkpointId);
  if (!checkpoint) {
    return NextResponse.json({ ok: false, error: "Checkpoint not found." }, { status: 404 });
  }

  if (checkpoint.audio_path) {
    await service.storage.from(CHECKPOINT_AUDIO_BUCKET).remove([checkpoint.audio_path]);
  }
  const { error } = await service
    .from("qr_checkpoints")
    .update({ audio_path: null })
    .eq("id", checkpointId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
