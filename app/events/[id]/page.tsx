import Link from "next/link";
import { notFound } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,gun_time,pr_cutoff")
    .eq("id", id)
    .single();

  if (error || !event) {
    notFound();
  }

  const { data: distances } = await supabase
    .from("distances")
    .select("id,label,gun_time,entry_fee_cents")
    .eq("event_id", id)
    .order("gun_time", { ascending: true, nullsFirst: true });

  return (
    <main style={{ padding: 24 }}>
      <h1>{event.name}</h1>
      <p>
        {event.city} {event.state}
      </p>
      <p>Race date: {event.race_date}</p>
      <p>Gun time: {event.gun_time}</p>
      <p>PR cutoff: {event.pr_cutoff}</p>

      {distances && distances.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>Races</h2>
          <ul style={{ listStyle: "disc", paddingLeft: 24 }}>
            {distances.map((d) => {
              const feeCents = (d as { entry_fee_cents?: number }).entry_fee_cents ?? 0;
              const feeStr = feeCents === 0 ? "$0" : `$${(feeCents / 100).toFixed(2)}`;
              return (
                <li key={d.id}>
                  {d.label}
                  {(d as { gun_time?: string }).gun_time ? ` — ${new Date((d as { gun_time?: string }).gun_time!).toLocaleString()}` : ""}
                  {` — ${feeStr}`}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p style={{ marginTop: 24 }}>
        <Link href={`/events/${event.id}/enter`}>Enter race</Link>
      </p>
    </main>
  );
}
