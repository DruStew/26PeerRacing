import Link from "next/link";
import { notFound } from "next/navigation";

import { DemoParticipantsImportClient } from "@/components/demo/DemoParticipantsImportClient";
import { DemoEventBanner } from "@/components/demo/DemoEventBanner";
import { DeleteEventSection } from "@/components/promoter/DeleteEventSection";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DemoRaceHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,is_demo")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!event || !(event as { is_demo?: boolean }).is_demo) notFound();

  const { data: distances } = await supabase
    .from("distances")
    .select("id,label,sort_order")
    .eq("event_id", id)
    .order("sort_order", { ascending: true });

  const { count: entryCount } = await supabase
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("event_id", id);

  const tools = [
    { label: "Manage race & distances", href: `/promoter/events/${id}/edit`, desc: "Fees, gun times, payout settings per distance" },
    { label: "Import participants", href: `#import`, desc: "CSV — no accounts required" },
    { label: "Check-in roster", href: `/promoter/events/${id}/roster`, desc: "Same desk as race day; manual finish times" },
    { label: "Payout calculator", href: `/promoter/events/${id}/payout`, desc: "Division pools and schedules" },
    { label: "Results console", href: `/promoter/events/${id}/results`, desc: "Live divisions and money preview — cannot publish" },
    { label: "Import finish times", href: `/promoter/events/${id}/results/import`, desc: "Timing CSV" },
    { label: "Runner view", href: `/admin/demo-races/${id}/runner-view`, desc: "What any racer's My Results page would show — time, badges, money" },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
      <Link href="/admin/demo-races" className="text-sm font-medium text-[#1E3A5F]/70 hover:text-[#E87722]">
        ← Demo races
      </Link>

      <div className="mt-6">
        <DemoEventBanner eventId={id} />
      </div>

      <h1 className="font-display mt-8 text-3xl font-bold text-[#1E3A5F]">{event.name}</h1>
      <p className="mt-1 text-sm text-[#1E3A5F]/65">
        {formatCalendarDate(event.race_date as string)} · {entryCount ?? 0} participant
        {(entryCount ?? 0) === 1 ? "" : "s"}
      </p>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Walkthrough steps</h2>
        <ol className="mt-4 space-y-3">
          {tools.map((t, i) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="block rounded-xl border border-[#1E3A5F]/10 bg-white p-4 shadow-sm transition-colors hover:border-[#E87722]/40"
              >
                <span className="text-xs font-semibold text-[#E87722]">Step {i + 1}</span>
                <p className="font-semibold text-[#1E3A5F]">{t.label}</p>
                <p className="text-sm text-[#1E3A5F]/65">{t.desc}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section id="import" className="mt-12 scroll-mt-8">
        <DemoParticipantsImportClient
          eventId={id}
          eventName={event.name as string}
          distances={(distances ?? []).map((d) => ({
            id: d.id as string,
            label: d.label as string,
            sort_order: (d as { sort_order?: number | null }).sort_order ?? null,
          }))}
        />
      </section>

      <DeleteEventSection
        eventId={id}
        eventName={event.name as string}
        entryCount={entryCount ?? 0}
        publishedDistanceCount={0}
        deleteRedirect="/admin/demo-races"
        demoMode
      />
    </main>
  );
}
