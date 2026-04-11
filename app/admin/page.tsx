import Link from "next/link";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  const supabase = await createServerSupabaseClient();

  const [{ count: eventCount }, { count: entryCount }, { count: memberCount }] = await Promise.all([
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("entries").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  const cards = [
    {
      label: "Events",
      value: eventCount ?? "—",
      href: "/admin/events",
      hint: "All races in the system",
    },
    {
      label: "Entries",
      value: entryCount ?? "—",
      href: "/admin/events",
      hint: "Total registrations (all events)",
    },
    {
      label: "Profiles",
      value: memberCount ?? "—",
      href: "/admin/members",
      hint: "Member profiles",
    },
  ] as const;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
        Internal
      </p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
        Admin Dashboard
      </h1>
      <p className="mt-3 max-w-2xl text-pretty text-[#1E3A5F]/75">
        Company-wide overview. Open events to review race info and entrants, search members to
        manage roles, and use communications when messaging is wired up.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <li key={c.label}>
            <Link
              href={c.href}
              className="flex h-full flex-col rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-5 shadow-sm transition-colors hover:border-[#E87722]/40 hover:shadow-md"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                {c.label}
              </span>
              <span className="font-display mt-2 text-3xl font-bold tabular-nums text-[#1E3A5F]">
                {c.value}
              </span>
              <span className="mt-2 text-sm text-[#1E3A5F]/65">{c.hint}</span>
              <span className="mt-4 text-sm font-semibold text-[#E87722]">View →</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12 rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Quick Links</h2>
        <ul className="mt-4 space-y-2 text-sm text-[#1E3A5F]/85">
          <li>
            <Link href="/admin/events" className="font-medium text-[#E87722] hover:underline">
              All events & entrants
            </Link>
            <span className="text-[#1E3A5F]/60"> — browse any race, see full entry lists</span>
          </li>
          <li>
            <Link href="/admin/bulk-import" className="font-medium text-[#E87722] hover:underline">
              Bulk import CSV
            </Link>
            <span className="text-[#1E3A5F]/60"> — batch entries for any event (batched DB writes)</span>
          </li>
          <li>
            <Link href="/admin/members" className="font-medium text-[#E87722] hover:underline">
              Members & roles
            </Link>
            <span className="text-[#1E3A5F]/60"> — search profiles, assign admin / promoter / check-in</span>
          </li>
          <li>
            <Link href="/admin/comms" className="font-medium text-[#E87722] hover:underline">
              Communications
            </Link>
            <span className="text-[#1E3A5F]/60"> — email & SMS to individuals or segments (placeholder)</span>
          </li>
          <li>
            <Link href="/events" className="font-medium text-[#1E3A5F] underline-offset-2 hover:text-[#E87722] hover:underline">
              Public events site
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
