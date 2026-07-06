"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

function normEmail(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error("Enter a valid contact email or leave blank to use your profile email.");
  }
  return trimmed;
}

export async function updateOrganizerContact(formData: FormData): Promise<void> {
  const eventId = String(formData.get("event_id") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "").trim();
  const organizerContactName = String(formData.get("organizer_contact_name") ?? "").trim() || null;
  const organizerContactEmail = normEmail(String(formData.get("organizer_contact_email") ?? ""));

  if (!eventId) throw new Error("Missing event");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent(returnTo || `/promoter/events/${eventId}/edit`)}`);
  }

  const { error } = await supabase
    .from("events")
    .update({
      organizer_contact_name: organizerContactName,
      organizer_contact_email: organizerContactEmail,
    })
    .eq("id", eventId);

  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/promoter/events/${eventId}/edit`);

  if (returnTo.startsWith("/")) redirect(returnTo);
  redirect(`/promoter/events/${eventId}/edit`);
}
