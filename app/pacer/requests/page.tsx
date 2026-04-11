import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";
import { requireActiveMembership, type MembershipRow } from "@/lib/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { PacerAcceptButton } from "./PacerAcceptButton";

function embedEvent(
  v:
    | { id: string; name: string; race_date: string; city: string | null; state: string | null }
    | Array<{
        id: string;
        name: string;
        race_date: string;
        city: string | null;
        state: string | null;
      }>
    | null
    | undefined,
) {
  if (v == null) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function embedDistance(
  v:
    | { id: string; label: string; allow_pacers: boolean }
    | Array<{ id: string; label: string; allow_pacers: boolean }>
    | null
    | undefined,
) {
  if (v == null) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PacerRequestsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent("/pacer/requests")}`);
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
    .eq("user_id", user.id)
    .single();

  requireActiveMembership(membership as MembershipRow | null, "/pacer/requests");

  const { data: openRequestsRaw } = await supabase
    .from("entries")
    .select(
      "id,event_id,distance_id,first_name,last_name,events(id,name,race_date,city,state),distances(id,label,allow_pacers)",
    )
    .eq("pacer_status", "requested")
    .is("pacer_user_id", null);

  type Row = {
    id: string;
    event_id: string;
    first_name?: string;
    last_name?: string;
  };

  const openRequests = (openRequestsRaw ?? []).filter((r) => {
    const d = embedDistance(
      r.distances as Parameters<typeof embedDistance>[0],
    );
    return d?.allow_pacers === true;
  }) as Row[];

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Pacer Network
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
          Pacer Requests
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-[#1E3A5F]/75">
          Open requests from runners who want a Peer Racing member as a pacer. You need an active
          membership to accept. When you accept, you&apos;ll be connected to their entry for that
          race distance.
        </p>

        {openRequests.length === 0 ? (
          <div className="mt-10 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] px-6 py-12 text-center">
            <p className="text-sm text-[#1E3A5F]/75">
              No open pacer requests right now. When runners request a pacer for a distance that
              allows pacers, they&apos;ll appear here.
            </p>
          </div>
        ) : (
          <ul className="mt-10 space-y-4">
            {openRequests.map((r) => {
              const event = embedEvent(
                (r as { events?: Parameters<typeof embedEvent>[0] }).events,
              );
              const distance = embedDistance(
                (r as { distances?: Parameters<typeof embedDistance>[0] }).distances,
              );
              const location =
                [event?.city, event?.state].filter(Boolean).join(", ") || null;

              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-semibold text-[#1E3A5F]">
                        {event?.name ?? "Event"}{" "}
                        <span className="text-[#1E3A5F]/55">·</span>{" "}
                        <span className="text-[#1E3A5F]">{distance?.label ?? "Distance"}</span>
                      </p>
                      {event?.race_date ? (
                        <p className="mt-2 text-sm text-[#1E3A5F]/70">
                          {formatCalendarDate(event.race_date)}
                          {location ? ` · ${location}` : ""}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm text-[#1E3A5F]/80">
                        Runner: {r.first_name ?? ""} {r.last_name ?? ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      <PacerAcceptButton entryId={r.id} eventId={r.event_id} />
                      {event?.id ? (
                        <Link
                          href={`/events/${event.id}`}
                          className="text-sm font-medium text-[#E87722] underline-offset-2 hover:underline"
                        >
                          View event
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-10 text-center text-sm text-[#1E3A5F]/70 sm:text-left">
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="font-medium text-[#E87722] underline-offset-2 transition-colors hover:underline"
          >
            Back to Upcoming Races
          </Link>
        </p>
      </main>
    </div>
  );
}
