import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { CheckpointBoard } from "@/components/checkpoints/CheckpointBoard";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { EventNav } from "@/components/promoter/EventNav";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/**
 * Promoter live board: who has scanned which QR checkpoint, plus the toggle
 * that opens the same board to the public (family and spectators).
 */
export default async function EventCheckpointsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/checkpoints`)}`);
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,promoter_id,is_demo,checkpoint_scans_public")
    .eq("id", id)
    .single();
  if (error || !event) notFound();

  if (!(await canManageEvent(supabase, auth.user.id, (event as { promoter_id?: string }).promoter_id))) {
    notFound();
  }

  const isDemo = (event as { is_demo?: boolean }).is_demo === true;
  const isPublic = (event as { checkpoint_scans_public?: boolean }).checkpoint_scans_public === true;

  const setBoardVisibility = async (formData: FormData) => {
    "use server";
    const makePublic = formData.get("make_public") === "1";

    const supabase = await createServerSupabaseClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/checkpoints`)}`);
    }
    const { data: ev } = await supabase.from("events").select("id,promoter_id").eq("id", id).single();
    if (!ev || !(await canManageEvent(supabase, auth.user.id, (ev as { promoter_id?: string }).promoter_id))) {
      throw new Error("Not allowed.");
    }

    const service = createServiceRoleSupabaseClient();
    if (!service) throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");

    const { error } = await service
      .from("events")
      .update({ checkpoint_scans_public: makePublic })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath(`/promoter/events/${id}/checkpoints`);
    revalidatePath(`/events/${id}/live`);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Live Checkpoint Board
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F]">
          {(event as { name: string }).name}
        </h1>

        <EventNav eventId={id} current="checkpoints" isDemo={isDemo} />

        <div className="mt-8 flex flex-col gap-4 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#1E3A5F]">
              Public spectator view: {isPublic ? "ON" : "OFF"}
            </p>
            <p className="mt-1 text-sm text-[#1E3A5F]/65">
              {isPublic ? (
                <>
                  Anyone with the link can watch runners move checkpoint to checkpoint:{" "}
                  <Link href={`/events/${id}/live`} className="font-medium text-[#E87722] hover:underline">
                    peerracing.com/events/…/live
                  </Link>
                </>
              ) : (
                "Only you can see this board. Flip it on to give families and spectators a live view."
              )}
            </p>
          </div>
          <form action={setBoardVisibility}>
            <input type="hidden" name="make_public" value={isPublic ? "0" : "1"} />
            <button
              type="submit"
              className={`rounded-md px-4 py-2.5 text-sm font-semibold text-white ${
                isPublic ? "bg-[#1E3A5F] hover:bg-[#1E3A5F]/90" : "bg-[#E87722] hover:bg-[#E87722]/90"
              }`}
            >
              {isPublic ? "Make board private" : "Make board public"}
            </button>
          </form>
        </div>

        <div className="mt-8">
          <CheckpointBoard eventId={id} />
        </div>

        <p className="mt-8 text-sm text-[#1E3A5F]/55">
          Add or edit QR checkpoints (and their audio stories) on each distance&apos;s edit page,
          then download the print-ready signs there.
        </p>
      </main>
    </div>
  );
}
