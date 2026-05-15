import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEventLocalDateString } from "@/lib/kiosk/event-local-date";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export type EventKioskRow = {
  event_id: string;
  codes_for_local_date: string;
  generation_version: number;
};

/**
 * Ensures event_kiosk exists and is rolled forward for the event's local calendar day.
 * Increments generation_version when the local date advances (daily auto) or when forced.
 */
export async function ensureKioskRowForEvent(
  admin: SupabaseClient,
  eventId: string,
  timeZone: string,
  options?: { forceRegenerate?: boolean },
): Promise<EventKioskRow> {
  const today = getEventLocalDateString(timeZone);

  const { data: existing } = await admin
    .from("event_kiosk")
    .select("event_id,codes_for_local_date,generation_version")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!existing) {
    const { data: inserted, error } = await admin
      .from("event_kiosk")
      .insert({
        event_id: eventId,
        codes_for_local_date: today,
        generation_version: 1,
      })
      .select("event_id,codes_for_local_date,generation_version")
      .single();
    if (error || !inserted) {
      throw new Error(error?.message ?? "Could not create kiosk row");
    }
    return inserted as EventKioskRow;
  }

  const row = existing as EventKioskRow;
  const storedDate = row.codes_for_local_date;
  let nextVersion = row.generation_version;
  let nextDate = storedDate;

  if (options?.forceRegenerate) {
    nextVersion += 1;
    nextDate = today;
  } else if (today > storedDate) {
    nextVersion += 1;
    nextDate = today;
  }

  if (nextVersion !== row.generation_version || nextDate !== storedDate) {
    const { data: updated, error } = await admin
      .from("event_kiosk")
      .update({
        codes_for_local_date: nextDate,
        generation_version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .select("event_id,codes_for_local_date,generation_version")
      .single();
    if (error || !updated) {
      throw new Error(error?.message ?? "Could not update kiosk row");
    }
    return updated as EventKioskRow;
  }

  return row;
}

export function getServiceOrThrow() {
  const admin = createServiceRoleSupabaseClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return admin;
}
