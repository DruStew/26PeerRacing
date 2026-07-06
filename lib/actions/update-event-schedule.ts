"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Updates event-level schedule: event dates and the online registration
 * window (opens = entries_open_at, closes = pr_cutoff). Gun times and
 * check-in windows are per distance only.
 * RLS allows the event promoter or a user with the global `admin` role.
 */
export async function updateEventSchedule(formData: FormData): Promise<void> {
  const eventId = String(formData.get("event_id") ?? "").trim();
  const raceDate = String(formData.get("race_date") ?? "").trim();
  const endDateRaw = String(formData.get("end_date") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "").trim();

  if (!eventId) {
    throw new Error("Missing event");
  }
  if (!raceDate) {
    throw new Error("Race day is required");
  }

  const parseDatetime = (field: string): string | null => {
    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const endDate = endDateRaw || null;
  const entriesOpenAt = parseDatetime("entries_open_at");
  const onlineRegClosesAt = parseDatetime("online_reg_closes_at");

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
      race_date: raceDate,
      end_date: endDate,
      entries_open_at: entriesOpenAt,
      pr_cutoff: onlineRegClosesAt,
    })
    .eq("id", eventId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/promoter/events/${eventId}/edit`);
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath("/promoter");

  if (returnTo.startsWith("/")) {
    redirect(returnTo);
  }
  redirect(`/promoter/events/${eventId}/edit`);
}
