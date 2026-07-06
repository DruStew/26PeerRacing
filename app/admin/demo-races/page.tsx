import Link from "next/link";

import { formatCalendarDate } from "@/lib/format-calendar-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DemoRacesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: events, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,created_at")
    .eq("is_demo", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const list = events ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
      <Link href="/admin" className="text-sm font-medium text-[#1E3A5F]/70 hover:text-[#E87722]">
        ← Admin
      </Link>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700/80">Super Admin</p>
      <h1 className="font-display mt-2 text-3xl font-bold text-[#1E3A5F]">Demo races</h1>
      <p className="mt-3 max-w-2xl text-sm text-[#1E3A5F]/75">
        Sandbox events for walking a producer through Peer Racing — full tools, no publish, no wallets.
        Delete when done.
      </p>
      <Link
        href="/admin/demo-races/new"
        className="mt-6 inline-flex rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#E87722]/90"
      >
        Create demo race
      </Link>

      {list.length === 0 ? (
        <p className="mt-10 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] px-6 py-10 text-center text-sm text-[#1E3A5F]/70">
          No demo races yet.
        </p>
      ) : (
        <ul className="mt-10 space-y-3">
          {list.map((event) => (
            <li key={event.id}>
              <Link
                href={`/admin/demo-races/${event.id}`}
                className="block rounded-xl border border-violet-200/80 bg-white p-5 shadow-sm transition-colors hover:border-[#E87722]/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-lg font-semibold text-[#1E3A5F]">{event.name}</span>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
                    Demo
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#1E3A5F]/65">
                  {formatCalendarDate(event.race_date as string)}
                  {[event.city, event.state].filter(Boolean).length
                    ? ` · ${[event.city, event.state].filter(Boolean).join(", ")}`
                    : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
