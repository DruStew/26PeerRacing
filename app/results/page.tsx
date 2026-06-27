import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { RaceResultsIndexClient } from "@/components/results/RaceResultsIndexClient";
import { areEntriesOpenForEvent } from "@/lib/event-entry-status";
import {
  raceMonthKeyFromDate,
  type RaceResultsIndexCard,
} from "@/lib/race-results-index";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DistanceRow = {
  id: string;
  event_id: string;
  label: string | null;
  gun_time: string | null;
  sort_order: number | null;
  pr_cutoff: string | null;
  results_published_at: string | null;
};

type EventRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  race_date: string | null;
};

type DistanceStatus = "published" | "awaiting" | "open";

function distanceStatus(d: DistanceRow): DistanceStatus {
  if (d.results_published_at) return "published";
  const stillOpen = areEntriesOpenForEvent(null, [
    { pr_cutoff: d.pr_cutoff, results_published_at: d.results_published_at },
  ]);
  return stillOpen ? "open" : "awaiting";
}

export default async function RaceResultsIndexPage() {
  const { data: eventRows } = await supabaseServer
    .from("events")
    .select("id,name,city,state,race_date")
    .eq("status", "published")
    .order("race_date", { ascending: false });

  const allEvents = (eventRows ?? []) as EventRow[];
  const allEventIds = allEvents.map((e) => e.id);

  const distancesByEvent = new Map<string, DistanceRow[]>();
  if (allEventIds.length > 0) {
    const { data: distanceRows } = await supabaseServer
      .from("distances")
      .select("id,event_id,label,gun_time,sort_order,pr_cutoff,results_published_at")
      .in("event_id", allEventIds);
    for (const row of (distanceRows ?? []) as DistanceRow[]) {
      const arr = distancesByEvent.get(row.event_id) ?? [];
      arr.push(row);
      distancesByEvent.set(row.event_id, arr);
    }
  }

  const sortDistances = (rows: DistanceRow[]): DistanceRow[] =>
    [...rows].sort((a, b) => {
      const at = a.gun_time ? new Date(a.gun_time).getTime() : NaN;
      const bt = b.gun_time ? new Date(b.gun_time).getTime() : NaN;
      if (!Number.isNaN(at) && !Number.isNaN(bt) && at !== bt) return at - bt;
      return (a.sort_order ?? 999) - (b.sort_order ?? 999);
    });

  const cards: RaceResultsIndexCard[] = allEvents
    .map((event) => {
      const rows = sortDistances(distancesByEvent.get(event.id) ?? []).map((d) => ({
        ...d,
        status: distanceStatus(d),
      }));
      const published = rows.filter((d) => d.status === "published");
      const awaiting = rows.filter((d) => d.status === "awaiting");
      const lastPublishedAt = published.reduce((max, d) => {
        const t = d.results_published_at ? new Date(d.results_published_at).getTime() : 0;
        return Number.isNaN(t) ? max : Math.max(max, t);
      }, 0);
      const raceTime = event.race_date ? new Date(event.race_date).getTime() : 0;
      return {
        card: {
          eventId: event.id,
          eventName: event.name ?? "Untitled race",
          city: event.city,
          state: event.state,
          raceDate: event.race_date,
          raceMonth: raceMonthKeyFromDate(event.race_date),
          published: published.map((d) => ({ id: d.id, label: d.label })),
          awaiting: awaiting.map((d) => ({ id: d.id, label: d.label })),
          awaitingOnly: published.length === 0,
        },
        sortAt: lastPublishedAt || raceTime,
      };
    })
    .filter((c) => c.card.published.length > 0 || c.card.awaiting.length > 0)
    .sort((a, b) => b.sortAt - a.sortAt)
    .map((c) => c.card);

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-8 text-center sm:text-left">
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            Race Results
          </h1>
          <p className="mt-3 text-[#1E3A5F]/70">
            Official, published results — standings, divisions, badges, and payouts.
          </p>
        </div>

        <RaceResultsIndexClient cards={cards} />
      </main>
    </div>
  );
}
