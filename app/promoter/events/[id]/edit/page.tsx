import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const PAGE_SIZE = 10;

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,gun_time,pr_cutoff,status")
    .eq("id", id)
    .single();

  if (error || !event) {
    notFound();
  }

  const page = Math.max(1, Number(resolvedSearchParams.page ?? "1"));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: distances } = await supabase
    .from("distances")
    .select("id,label,gun_time")
    .eq("event_id", id)
    .order("gun_time", { ascending: true, nullsFirst: true })
    .range(from, to);

  const { data: qualifierDistance } = await supabase
    .from("distances")
    .select("id,label")
    .eq("event_id", id)
    .eq("is_peer_racing_qualifier", true)
    .maybeSingle();

  const { count } = await supabase
    .from("distances")
    .select("id", { count: "exact", head: true })
    .eq("event_id", id);

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  const addDistance = async (formData: FormData) => {
    "use server";

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      redirect("/login");
    }

    const label = String(formData.get("label") ?? "").trim();
    const gunTimeRaw = String(formData.get("gun_time") ?? "").trim();
    const gunTime = gunTimeRaw ? new Date(gunTimeRaw).toISOString() : null;
    const prCutoffRaw = String(formData.get("pr_cutoff") ?? "").trim();
    const prCutoff = prCutoffRaw ? new Date(prCutoffRaw).toISOString() : null;
    const isQualifier = formData.get("is_peer_racing_qualifier") === "1";
    const allowRollOverFrom = String(formData.get("allow_roll_over_from_qualifier") ?? "").toLowerCase() === "yes";
    const allowQualifierRollOverHere = String(formData.get("allow_qualifier_split_to_roll_over_here") ?? "").toLowerCase() === "yes";
    const allowPacers = formData.get("allow_pacers") === "1";
    const pacerFeeCentsRaw = formData.get("pacer_fee_cents");
    const pacerFeeCents = pacerFeeCentsRaw != null && String(pacerFeeCentsRaw).trim() !== "" ? Math.max(0, parseInt(String(pacerFeeCentsRaw), 10) || 0) : 0;
    const entryFeeDollarsRaw = formData.get("entry_fee_dollars");
    const entryFeeCents = (() => {
      if (entryFeeDollarsRaw == null || String(entryFeeDollarsRaw).trim() === "") return 0;
      const d = parseFloat(String(entryFeeDollarsRaw));
      if (Number.isNaN(d) || d < 0) return 0;
      return Math.round(d * 100);
    })();

    const { data: inserted, error } = await supabase
      .from("distances")
      .insert({
        event_id: id,
        label,
        gun_time: gunTime,
        pr_cutoff: prCutoff,
        is_peer_racing_qualifier: isQualifier,
        allow_roll_over_from_qualifier: isQualifier && allowRollOverFrom,
        allow_qualifier_split_to_roll_over_here: !isQualifier && allowQualifierRollOverHere,
        allow_pacers: allowPacers,
        pacer_fee_cents: pacerFeeCents,
        entry_fee_cents: entryFeeCents,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    redirect(`/promoter/events/${id}/edit`);
  };

  const publishEvent = async () => {
    "use server";

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      redirect("/login");
    }

    const { error } = await supabase
      .from("events")
      .update({ status: "published" })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    redirect(`/promoter/events/${id}/edit`);
  };

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>Edit Event</h1>
      <p>
        <strong>Status:</strong> {event.status}
      </p>
      <p>
        {event.name} · {event.city} {event.state}
      </p>
      <p>
        Dates: {event.race_date}
        {event.gun_time || event.pr_cutoff
          ? ` · Gun time: ${event.gun_time ?? "—"} · PR cutoff: ${event.pr_cutoff ?? "—"} (set per distance below)`
          : " · Set gun time and PR cutoff per distance below."}
      </p>
      <p>
        Public link: <Link href={`/events/${event.id}`}>/events/{event.id}</Link>
      </p>

      <section style={{ marginTop: 24 }}>
        <h2>Add distance</h2>
        <form action={addDistance}>
          <label htmlFor="label">Label</label>
          <input id="label" name="label" required style={{ display: "block" }} />

          <label htmlFor="entry_fee_dollars" style={{ display: "block", marginTop: 8 }}>Entry fee ($)</label>
          <input id="entry_fee_dollars" name="entry_fee_dollars" type="number" min={0} step={0.01} defaultValue={0} style={{ display: "block" }} />

          <label htmlFor="gun_time" style={{ display: "block", marginTop: 8 }}>Gun time (optional)</label>
          <input id="gun_time" name="gun_time" type="datetime-local" style={{ display: "block" }} />

          <label htmlFor="pr_cutoff" style={{ display: "block", marginTop: 8 }}>PR / entry cutoff (optional)</label>
          <input id="pr_cutoff" name="pr_cutoff" type="datetime-local" style={{ display: "block" }} />

          <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
            <strong>Peer Racing Qualifier</strong>
            <p style={{ fontSize: 14, color: "#555", marginTop: 4 }}>
              You may have only one Qualifier per event. Runners can enter the Qualifier and optionally roll their split to other races you allow below.
            </p>
            {qualifierDistance ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 14 }}>This event&apos;s Peer Racing Qualifier is <strong>{qualifierDistance.label}</strong>.</p>
                <label style={{ display: "block", marginTop: 12, fontSize: 14 }}>
                  Would you like to allow split for Peer Racing Qualifier to roll over to this race?
                  <select name="allow_qualifier_split_to_roll_over_here" style={{ display: "block", marginTop: 4 }}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" name="is_peer_racing_qualifier" value="1" />
                  This race is the Peer Racing Qualifier
                </label>
                <label style={{ display: "block", marginTop: 12, fontSize: 14 }}>
                  Would you like to allow roll over splits from this race?
                  <select name="allow_roll_over_from_qualifier" style={{ display: "block", marginTop: 4 }}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
            <strong>Pacers</strong>
            <p style={{ fontSize: 14, color: "#555", marginTop: 4 }}>Allow runners to request a registered Peer Racing member as pacer.</p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <input type="checkbox" name="allow_pacers" value="1" />
              Allow pacers for this distance
            </label>
            <label style={{ display: "block", marginTop: 12, fontSize: 14 }}>
              Pacer fee (cents, $0 allowed)
              <input type="number" name="pacer_fee_cents" min={0} defaultValue={0} style={{ display: "block", marginTop: 4 }} />
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="submit">Add distance</button>
          </div>
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Distances</h2>
        <p style={{ fontSize: 14, color: "#666" }}>
          Add races and set one as the Peer Racing Qualifier (Edit). Other races can allow Qualifier split to roll over to them.
        </p>
        <ul>
          {distances?.map((distance) => (
            <li key={distance.id}>
              {distance.label}
              {(distance as { gun_time?: string }).gun_time ? ` · Gun ${(distance as { gun_time?: string }).gun_time}` : ""}
              {" · "}
              <Link href={`/promoter/events/${id}/distances/${distance.id}/edit`}>Edit</Link>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 8 }}>
          {page > 1 && (
            <Link href={`/promoter/events/${id}/edit?page=${page - 1}`}>
              Previous
            </Link>
          )}
          {page < totalPages && (
            <span style={{ marginLeft: 12 }}>
              <Link
                href={`/promoter/events/${id}/edit?page=${page + 1}`}
              >
                Next
              </Link>
            </span>
          )}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        {event.status === "published" ? (
          <p style={{ color: "#0a0", marginBottom: 8 }}>Event is live on the public list.</p>
        ) : null}
        <form action={publishEvent}>
          <button type="submit">
            {event.status === "published" ? "Publish again" : "Publish event"}
          </button>
        </form>
      </section>
    </main>
  );
}
