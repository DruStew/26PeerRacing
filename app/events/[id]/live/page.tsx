import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckpointBoard } from "@/components/checkpoints/CheckpointBoard";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/** Public spectator view of the live checkpoint board (promoter toggle-gated). */
export default async function PublicLiveBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const { data: event } = await service
    .from("events")
    .select("id,name,city,state,checkpoint_scans_public")
    .eq("id", id)
    .maybeSingle();
  if (!event || (event as { checkpoint_scans_public?: boolean }).checkpoint_scans_public !== true) {
    notFound();
  }

  const ev = event as { name: string; city: string | null; state: string | null };
  const location = [ev.city, ev.state].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Live Checkpoint Tracker
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F]">
          {ev.name}
        </h1>
        {location ? <p className="mt-1 text-sm text-[#1E3A5F]/65">{location}</p> : null}
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#1E3A5F]/70">
          Runners check in by scanning QR signs along the course. Times are unofficial and depend
          on cell coverage out there — no scan doesn&apos;t mean no runner.
        </p>

        <div className="mt-8">
          <CheckpointBoard eventId={id} />
        </div>

        <p className="mt-10 text-sm text-[#1E3A5F]/55">
          <Link href={`/events/${id}`} className="font-medium text-[#E87722] hover:underline">
            ← Back to the event page
          </Link>
        </p>
      </main>
    </div>
  );
}
