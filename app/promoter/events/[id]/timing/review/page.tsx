import { notFound, redirect } from "next/navigation";

import { EventNav } from "@/components/promoter/EventNav";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { TimingReviewClient } from "@/components/timing/TimingReviewClient";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/** Review camera crossings, assign runners, confirm times into the Results Console. */
export default async function TimingReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { id } = await params;
  const { session: sessionParam } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/timing/review`)}`);
  }
  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,promoter_id,is_demo")
    .eq("id", id)
    .single();
  if (error || !event) notFound();
  if (!(await canManageEvent(supabase, auth.user.id, (event as { promoter_id?: string }).promoter_id))) {
    notFound();
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");

  const [{ data: sessionsRaw }, { data: distRaw }, { data: entriesRaw }, { data: tagsRaw }] =
    await Promise.all([
      service
        .from("timing_sessions")
        .select("id,label,status,created_at")
        .eq("event_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      service.from("distances").select("id,label").eq("event_id", id).order("sort_order"),
      service
        .from("entries")
        .select("id,first_name,last_name,assigned_bib,bib,distance_id")
        .eq("event_id", id),
      service.from("timing_tags").select("tag_id,entry_id").eq("event_id", id),
    ]);

  const sessions = (sessionsRaw ?? []) as { id: string; label: string; status: string; created_at: string }[];
  const sessionIds = sessions.map((s) => s.id);

  const [{ data: gunsRaw }, { data: eventsRaw }] = await Promise.all([
    sessionIds.length
      ? service
          .from("timing_gun_marks")
          .select("session_id,distance_id,gun_at")
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [] }),
    sessionIds.length
      ? service
          .from("timing_finish_events")
          .select("id,session_id,distance_id,entry_id,tag_id,crossed_at,elapsed_ms,source,status,detail")
          .in("session_id", sessionIds)
          .order("crossed_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const ev = event as { id: string; name: string; is_demo?: boolean };

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Promoter · {ev.name}
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">
          Finish Cam — Review & Assign
        </h1>
        <EventNav eventId={ev.id} current="timing" isDemo={ev.is_demo === true} />

        <TimingReviewClient
          eventId={ev.id}
          initialSessionId={sessionParam ?? null}
          sessions={sessions}
          distances={(distRaw ?? []) as { id: string; label: string }[]}
          entries={
            (entriesRaw ?? []) as {
              id: string;
              first_name: string | null;
              last_name: string | null;
              assigned_bib: string | null;
              bib: string | null;
              distance_id: string;
            }[]
          }
          tagBindings={(tagsRaw ?? []) as { tag_id: number; entry_id: string }[]}
          gunMarks={(gunsRaw ?? []) as { session_id: string; distance_id: string; gun_at: string }[]}
          finishEvents={
            (eventsRaw ?? []) as {
              id: string;
              session_id: string;
              distance_id: string | null;
              entry_id: string | null;
              tag_id: number | null;
              crossed_at: string;
              elapsed_ms: number | null;
              source: string;
              status: string;
              detail: Record<string, unknown>;
            }[]
          }
        />
      </main>
    </div>
  );
}
