import Image from "next/image";
import Link from "next/link";

import { formatCalendarDate } from "@/lib/format-calendar-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type EventRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  race_date: string;
  status: string;
  created_at: string;
  promoter_id: string;
  artwork_url: string | null;
};

export default async function AdminEventsPage() {
  const supabase = await createServerSupabaseClient();

  const { data: events, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,status,created_at,promoter_id,artwork_url")
    .order("race_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const list = (events ?? []) as EventRow[];
  const promoterIds = [...new Set(list.map((e) => e.promoter_id))];

  const profileById = new Map<
    string,
    { first_name: string | null; last_name: string | null; email: string | null }
  >();
  if (promoterIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,email")
      .in("id", promoterIds);
    for (const p of profs ?? []) {
      profileById.set(p.id as string, {
        first_name: p.first_name as string | null,
        last_name: p.last_name as string | null,
        email: p.email as string | null,
      });
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
        Admin
      </p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
        All Events
      </h1>
      <p className="mt-3 max-w-2xl text-pretty text-[#1E3A5F]/75">
        Every race in the database. Open one for full race details and the entrant list.
      </p>

      {list.length === 0 ? (
        <div className="mt-10 rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 px-6 py-12 text-center text-sm text-[#1E3A5F]/75">
          No events yet.
        </div>
      ) : (
        <ul className="mt-10 space-y-4">
          {list.map((event) => {
            const location = [event.city, event.state].filter(Boolean).join(", ") || "—";
            const published = event.status === "published";
            const locked = event.status === "locked";
            const prof = profileById.get(event.promoter_id);
            const promoterLabel = prof
              ? [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email || "—"
              : "—";

            return (
              <li key={event.id}>
                <Link
                  href={`/admin/events/${event.id}`}
                  className="group flex flex-col gap-3 rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm transition-all hover:border-[#E87722]/50 hover:shadow-md sm:flex-row sm:items-start"
                >
                  {event.artwork_url ? (
                    <div className="relative aspect-[21/9] w-full shrink-0 overflow-hidden rounded-lg border border-[#1E3A5F]/10 bg-[#fafbfc] sm:aspect-auto sm:h-24 sm:w-32">
                      <Image
                        src={event.artwork_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="8rem"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-semibold text-[#1E3A5F] transition-colors group-hover:text-[#E87722]">
                        {event.name}
                      </h2>
                      {published ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/15">
                          Published
                        </span>
                      ) : locked ? (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-600/20">
                          Locked
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-[#1E3A5F]/08 px-2 py-0.5 text-xs font-medium text-[#1E3A5F]/80 ring-1 ring-[#1E3A5F]/15">
                          Draft
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#1E3A5F]/70">
                      <span>{formatCalendarDate(event.race_date)}</span>
                      <span>{location}</span>
                    </div>
                    <p className="mt-2 text-sm text-[#1E3A5F]/60">
                      Promoter: <span className="text-[#1E3A5F]/85">{promoterLabel}</span>
                    </p>
                    <p className="mt-3 text-sm font-semibold text-[#E87722]">Open admin view →</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
