import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireActiveMembership } from "@/lib/membership";

export default async function NewEventPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
    .eq("user_id", data.user.id)
    .single();

  requireActiveMembership(membership as { user_id: string; status: string; membership_start_at: string | null; membership_end_at: string | null; welcome_shown_at: string | null; renewal_count: number } | null, "/promoter/events/new");

  const createEvent = async (formData: FormData) => {
    "use server";

    const supabase = await createServerSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      redirect("/login");
    }

    const { data: mem } = await supabase
      .from("memberships")
      .select("user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
      .eq("user_id", userData.user.id)
      .single();
    requireActiveMembership(mem as { user_id: string; status: string; membership_start_at: string | null; membership_end_at: string | null; welcome_shown_at: string | null; renewal_count: number } | null, "/promoter/events/new");

    const name = String(formData.get("name") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim() || null;
    const state = String(formData.get("state") ?? "").trim() || null;
    const raceDate = String(formData.get("race_date") ?? "").trim();
    const eventType = String(formData.get("event_type") ?? "").trim();

    const insertPayload: Record<string, unknown> = {
      promoter_id: userData.user.id,
      name,
      city,
      state,
      race_date: raceDate,
      event_type: eventType,
      status: "draft",
    };

    if (raceDate) {
      const d = new Date(raceDate);
      if (!Number.isNaN(d.getTime())) {
        const noon = new Date(d);
        noon.setHours(12, 0, 0, 0);
        insertPayload.gun_time = noon.toISOString();
        insertPayload.pr_cutoff = noon.toISOString();
      }
    }

    const { data: created, error } = await supabase
      .from("events")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    redirect(`/promoter/events/${created.id}/edit`);
  };

  return (
    <main style={{ padding: 24, maxWidth: 640 }}>
      <h1>Create Event</h1>
      <form action={createEvent}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required style={{ display: "block" }} />

        <label htmlFor="city">City</label>
        <input id="city" name="city" style={{ display: "block" }} />

        <label htmlFor="state">State</label>
        <input id="state" name="state" style={{ display: "block" }} />

        <label htmlFor="race_date">Start date</label>
        <input
          id="race_date"
          name="race_date"
          type="date"
          required
          style={{ display: "block" }}
        />

        <label htmlFor="end_date">End date (optional — for multi-day events)</label>
        <input
          id="end_date"
          name="end_date"
          type="date"
          style={{ display: "block" }}
        />

        <label htmlFor="event_type">Event type</label>
        <select id="event_type" name="event_type" required>
          <option value="full">Full</option>
          <option value="overlay">Overlay</option>
        </select>

        <p style={{ marginTop: 16, fontSize: 14, color: "#666" }}>
          Gun times and PR cutoffs are set per race on the next page when you add distances.
        </p>

        <div style={{ marginTop: 16 }}>
          <button type="submit">Create event</button>
        </div>
      </form>
    </main>
  );
}
