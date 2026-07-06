import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { requireActiveMembership, type MembershipRow } from "@/lib/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

export default async function NewEventPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect(`/login?returnUrl=${encodeURIComponent("/promoter/events/new")}`);
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select(
      "user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count",
    )
    .eq("user_id", data.user.id)
    .single();

  requireActiveMembership(membership as MembershipRow | null, "/promoter/events/new");

  const createEvent = async (formData: FormData) => {
    "use server";

    const supabase = await createServerSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      redirect(`/login?returnUrl=${encodeURIComponent("/promoter/events/new")}`);
    }

    const { data: mem } = await supabase
      .from("memberships")
      .select(
        "user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count",
      )
      .eq("user_id", userData.user.id)
      .single();
    requireActiveMembership(mem as MembershipRow | null, "/promoter/events/new");

    const name = String(formData.get("name") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim() || null;
    const state = String(formData.get("state") ?? "").trim() || null;
    const raceDate = String(formData.get("race_date") ?? "").trim();
    const endDate = String(formData.get("end_date") ?? "").trim();
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

    if (endDate) {
      insertPayload.end_date = endDate;
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
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href="/promoter"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Promoter dashboard
        </Link>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          New Event
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
          Create Event
        </h1>
        <p className="mt-3 text-pretty text-[#1E3A5F]/75">
          Start with basics. You&apos;ll add races (distances), fees, and gun times on the next
          screen.
        </p>

        <div className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm sm:p-8">
          <form action={createEvent} className="space-y-5">
            <div>
              <label htmlFor="name" className="text-sm font-medium text-[#1E3A5F]">
                Event name
              </label>
              <input
                id="name"
                name="name"
                required
                autoComplete="off"
                className={inputClass}
                placeholder="Spring City Marathon"
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="city" className="text-sm font-medium text-[#1E3A5F]">
                  City
                </label>
                <input id="city" name="city" className={inputClass} placeholder="Austin" />
              </div>
              <div>
                <label htmlFor="state" className="text-sm font-medium text-[#1E3A5F]">
                  State
                </label>
                <input id="state" name="state" className={inputClass} placeholder="TX" />
              </div>
            </div>
            <div>
              <label htmlFor="race_date" className="text-sm font-medium text-[#1E3A5F]">
                Start date
              </label>
              <input
                id="race_date"
                name="race_date"
                type="date"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="end_date" className="text-sm font-medium text-[#1E3A5F]">
                End date <span className="font-normal text-[#1E3A5F]/55">(optional — multi-day)</span>
              </label>
              <input id="end_date" name="end_date" type="date" className={inputClass} />
            </div>
            <div>
              <label htmlFor="event_type" className="text-sm font-medium text-[#1E3A5F]">
                Event type
              </label>
              <select
                id="event_type"
                name="event_type"
                required
                className={`${inputClass} cursor-pointer`}
                defaultValue="full"
              >
                <option value="full">Full</option>
                <option value="overlay">Overlay</option>
              </select>
            </div>
            <p className="text-xs leading-relaxed text-[#1E3A5F]/60">
              Gun times and race check-in windows are set per race when you add distances on the
              next page.
            </p>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
            >
              Create event
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
