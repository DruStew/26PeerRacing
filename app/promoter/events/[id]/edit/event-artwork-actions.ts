"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ALLOWED_EVENT_ARTWORK_MIME,
  EVENT_ARTWORK_BUCKET,
  extFromArtworkMime,
  MAX_EVENT_ARTWORK_BYTES,
  storagePathFromArtworkPublicUrl,
} from "@/lib/event-artwork";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ArtworkActionState = { ok: boolean; error?: string } | null;

async function loadEventForPromoter(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  eventId: string,
  userId: string,
) {
  const { data: row, error } = await supabase
    .from("events")
    .select("id,promoter_id,artwork_url")
    .eq("id", eventId)
    .single();

  if (error || !row || row.promoter_id !== userId) {
    return null;
  }
  return row as { id: string; promoter_id: string; artwork_url: string | null };
}

export async function uploadEventArtwork(
  _prev: ArtworkActionState,
  formData: FormData,
): Promise<ArtworkActionState> {
  const eventId = String(formData.get("event_id") ?? "").trim();
  const file = formData.get("file");

  if (!eventId) {
    return { ok: false, error: "Missing event" };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${eventId}/edit`)}`);
  }

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image file" };
  }

  if (file.size > MAX_EVENT_ARTWORK_BYTES) {
    return { ok: false, error: "Image must be 5 MB or smaller" };
  }

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_EVENT_ARTWORK_MIME.has(mime)) {
    return { ok: false, error: "Use JPEG, PNG, WebP, or GIF" };
  }

  const event = await loadEventForPromoter(supabase, eventId, user.id);
  if (!event) {
    return { ok: false, error: "Not allowed to update this event" };
  }

  const ext = extFromArtworkMime(mime);
  const objectName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${eventId}/${objectName}`;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const { error: uploadError } = await supabase.storage
    .from(EVENT_ARTWORK_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mime,
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(EVENT_ARTWORK_BUCKET).getPublicUrl(storagePath);

  if (event.artwork_url) {
    const oldPath = storagePathFromArtworkPublicUrl(event.artwork_url);
    if (oldPath) {
      await supabase.storage.from(EVENT_ARTWORK_BUCKET).remove([oldPath]);
    }
  }

  const { error: updateError } = await supabase
    .from("events")
    .update({ artwork_url: publicUrl })
    .eq("id", eventId)
    .eq("promoter_id", user.id);

  if (updateError) {
    await supabase.storage.from(EVENT_ARTWORK_BUCKET).remove([storagePath]);
    return { ok: false, error: updateError.message };
  }

  revalidatePath(`/promoter/events/${eventId}/edit`);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");

  return { ok: true };
}

export async function removeEventArtwork(
  _prev: ArtworkActionState,
  formData: FormData,
): Promise<ArtworkActionState> {
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) {
    return { ok: false, error: "Missing event" };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${eventId}/edit`)}`);
  }

  const event = await loadEventForPromoter(supabase, eventId, user.id);
  if (!event) {
    return { ok: false, error: "Not allowed to update this event" };
  }

  if (event.artwork_url) {
    const oldPath = storagePathFromArtworkPublicUrl(event.artwork_url);
    if (oldPath) {
      await supabase.storage.from(EVENT_ARTWORK_BUCKET).remove([oldPath]);
    }
  }

  const { error } = await supabase
    .from("events")
    .update({ artwork_url: null })
    .eq("id", eventId)
    .eq("promoter_id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/promoter/events/${eventId}/edit`);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");

  return { ok: true };
}
