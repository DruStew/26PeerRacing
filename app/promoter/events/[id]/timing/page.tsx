import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EventNav } from "@/components/promoter/EventNav";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { FinishCamClient } from "@/components/timing/FinishCamClient";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/** Finish Cam: camera timing at the finish line. */
export default async function EventTimingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/timing`)}`);
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

  const { data: distRaw } = await service
    .from("distances")
    .select("id,label")
    .eq("event_id", id)
    .order("sort_order", { ascending: true });
  const distances = (distRaw ?? []) as { id: string; label: string }[];

  const ev = event as { id: string; name: string; is_demo?: boolean };

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Promoter · {ev.name}
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">Finish Cam</h1>
        <EventNav eventId={ev.id} current="timing" isDemo={ev.is_demo === true} />

        <div className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4 text-sm leading-relaxed text-[#1E3A5F]/80">
          <p className="font-semibold text-[#1E3A5F]">How it works</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Mount this phone on a tripod with a clear view across the finish line (slightly
              elevated, angled to see chest bibs approaching).
            </li>
            <li>Drag the orange line onto your physical finish line.</li>
            <li>
              Tap <strong>Start session &amp; record</strong> (needs signal once, for the clock
              sync — after that it runs fully offline).
            </li>
            <li>Tap <strong>GUN</strong> for each distance the moment it starts.</li>
            <li>
              Runners wearing{" "}
              <Link href="/promoter/timing-tags" className="font-semibold text-[#E87722] hover:underline">
                timing tag stickers
              </Link>{" "}
              (bound at check-in) are detected automatically. MARK is an optional bookmark for
              anyone else.
            </li>
            <li>After the race, review &amp; confirm — times land in your Results Console.</li>
          </ol>
        </div>

        {distances.length === 0 ? (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Add at least one distance to this event before timing.
          </p>
        ) : (
          <FinishCamClient eventId={ev.id} distances={distances} />
        )}

        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link
            href={`/promoter/events/${ev.id}/timing/review`}
            className="font-semibold text-[#E87722] hover:underline"
          >
            Review & assign finishes →
          </Link>
          <Link href="/promoter/timing-tags" className="font-semibold text-[#E87722] hover:underline">
            Print timing tags
          </Link>
        </div>
      </main>
    </div>
  );
}
