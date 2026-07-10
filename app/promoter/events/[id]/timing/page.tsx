import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EventNav } from "@/components/promoter/EventNav";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TOOLS = (eventId: string) =>
  [
    {
      title: "Finish Cam (the phone)",
      href: `/events/${eventId}/finish-cam`,
      desc: "Open on the tripod phone. Records continuously, detects timing tags, proposes crossings. Works offline after one clock sync.",
      badge: "Phone",
    },
    {
      title: "Race Control (the laptop)",
      href: `/events/${eventId}/race-control`,
      desc: "Start Race with a 10-second countdown, per-distance race clocks, MARK (spacebar), confirm crossings, watch clips, live leaderboard.",
      badge: "Laptop",
    },
    {
      title: "Big Screen",
      href: `/events/${eventId}/big-screen`,
      desc: "Vertical 1080×1920 display: pre-race roster scroll, countdown, finisher celebrations, live results — flips to official results at publish. Toggle public from Race Control.",
      badge: "TV",
    },
    {
      title: "Review & Assign",
      href: `/promoter/events/${eventId}/timing/review`,
      desc: "Full post-race review: every crossing, video scrub on the capture phone, frame-accurate corrections.",
      badge: "Any device",
    },
    {
      title: "Print timing tags",
      href: `/promoter/timing-tags`,
      desc: "Print-ready sticker sheets. Bind a sticker to each runner at check-in with “Scan timing tag”.",
      badge: "Print",
    },
  ] as const;

/** Camera timing hub: one card per race-day station. */
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
  const ev = event as { id: string; name: string; is_demo?: boolean };

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Promoter · {ev.name}
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">Camera Timing</h1>
        <EventNav eventId={ev.id} current="timing" isDemo={ev.is_demo === true} />

        <div className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4 text-sm leading-relaxed text-[#1E3A5F]/80">
          <p className="font-semibold text-[#1E3A5F]">Race-day setup</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Print timing tags; bind one to each runner at check-in.</li>
            <li>
              Phone (landscape, tripod, airplane mode + WiFi): open <strong>Finish Cam</strong>, drag
              the line, start recording. Borrowed phones sign in with the{" "}
              <Link href={`/promoter/events/${ev.id}/kiosk`} className="font-semibold text-[#E87722] hover:underline">
                kiosk code
              </Link>
              .
            </li>
            <li>
              Laptop: open <strong>Race Control</strong>. Hit <strong>Start Race</strong> — the big
              screen counts down 10 seconds, announcers fire the real gun on GO.
            </li>
            <li>Confirm crossings as they stream in (or enable auto-confirm) — times land in the Results Console live.</li>
          </ol>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {TOOLS(ev.id).map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm transition-colors hover:border-[#E87722]"
            >
              <span className="inline-flex rounded-full bg-[#1E3A5F]/10 px-2.5 py-0.5 text-xs font-semibold text-[#1E3A5F]/70">
                {t.badge}
              </span>
              <p className="font-display mt-2 text-lg font-semibold text-[#1E3A5F] group-hover:text-[#E87722]">
                {t.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[#1E3A5F]/65">{t.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
