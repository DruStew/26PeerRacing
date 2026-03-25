import Link from "next/link";

import { supabaseServer } from "@/lib/supabase/server";

const PAGE_SIZE = 10;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, Number(resolvedSearchParams.page ?? "1"));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: events } = await supabaseServer
    .from("events")
    .select("id,name,city,state,race_date,pr_cutoff")
    .eq("status", "published")
    .order("race_date", { ascending: true })
    .range(from, to);

  const { count } = await supabaseServer
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  return (
    <main style={{ padding: 24 }}>
      <h1>Events</h1>
      <ul>
        {events?.map((event) => (
          <li key={event.id}>
            <Link href={`/events/${event.id}`}>{event.name}</Link>
            <div>
              {event.race_date} · {event.city} {event.state}
            </div>
            <div>PR cutoff: {event.pr_cutoff}</div>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 12 }}>
        {page > 1 && <Link href={`/events?page=${page - 1}`}>Previous</Link>}
        {page < totalPages && (
          <span style={{ marginLeft: 12 }}>
            <Link href={`/events?page=${page + 1}`}>Next</Link>
          </span>
        )}
      </div>
    </main>
  );
}
