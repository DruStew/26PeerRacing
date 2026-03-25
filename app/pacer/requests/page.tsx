import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireActiveMembership } from "@/lib/membership";
import { PacerAcceptButton } from "./PacerAcceptButton";

export default async function PacerRequestsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?returnUrl=" + encodeURIComponent("/pacer/requests"));
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
    .eq("user_id", user.id)
    .single();

  requireActiveMembership(
    membership as {
      user_id: string;
      status: string;
      membership_start_at: string | null;
      membership_end_at: string | null;
      welcome_shown_at: string | null;
      renewal_count: number;
    } | null,
    "/pacer/requests",
  );

  const { data: openRequestsRaw } = await supabase
    .from("entries")
    .select(
      "id,event_id,distance_id,first_name,last_name,events(id,name,race_date,city,state),distances(id,label,allow_pacers)",
    )
    .eq("pacer_status", "requested")
    .is("pacer_user_id", null);

  type Row = (typeof openRequestsRaw)[number] & {
    events?: { id: string; name: string; race_date: string; city: string; state: string } | null;
    distances?: { id: string; label: string; allow_pacers: boolean } | null;
  };
  const openRequests = (openRequestsRaw ?? []).filter((r) => (r as Row).distances?.allow_pacers === true) as Row[];

  return (
    <main style={{ padding: 24, maxWidth: 640 }}>
      <h1>Pacer requests</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>
        Open requests from runners who want a Peer Racing member as pacer. You need an active membership to accept.
      </p>

      {openRequests.length === 0 ? (
        <p>No open pacer requests right now. When runners request a pacer for a distance that allows pacers, they’ll appear here.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {openRequests.map((r) => {
            const event = r.events;
            const distance = r.distances;
            return (
              <li
                key={r.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {event?.name ?? "Event"} · {distance?.label ?? "Distance"}
                </div>
                <div style={{ fontSize: 14, color: "#555", marginTop: 4 }}>
                  {event?.race_date} {event?.city && event?.state ? ` · ${event.city}, ${event.state}` : ""}
                </div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  Runner: {(r as { first_name?: string; last_name?: string }).first_name} {(r as { last_name?: string }).last_name}
                </div>
                <div style={{ marginTop: 12 }}>
                  <PacerAcceptButton entryId={r.id} eventId={r.event_id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p style={{ marginTop: 24 }}>
        <Link href="/events">Browse events</Link>
      </p>
    </main>
  );
}
