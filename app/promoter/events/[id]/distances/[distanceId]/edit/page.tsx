import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function EditDistancePage({
  params,
}: {
  params: Promise<{ id: string; distanceId: string }>;
}) {
  const { id: eventId, distanceId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,name")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    notFound();
  }

  const { data: distance, error: distanceError } = await supabase
    .from("distances")
    .select("id,label,gun_time,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here,allow_pacers,pacer_fee_cents,entry_fee_cents")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .single();

  if (distanceError || !distance) {
    notFound();
  }

  const { data: qualifierDistance } = await supabase
    .from("distances")
    .select("id,label")
    .eq("event_id", eventId)
    .eq("is_peer_racing_qualifier", true)
    .maybeSingle();

  const distanceWithExtras = distance as typeof distance & { sort_order?: number; gun_time?: string; pr_cutoff?: string; entry_fee_cents?: number };
  const entryFeeDollarsDefault = ((distanceWithExtras.entry_fee_cents ?? 0) / 100).toFixed(2);
  const gunTimeDefault = distanceWithExtras.gun_time
    ? new Date(distanceWithExtras.gun_time).toISOString().slice(0, 16)
    : "";
  const isThisQualifier = (distance as { is_peer_racing_qualifier?: boolean }).is_peer_racing_qualifier === true;
  const otherIsQualifier = qualifierDistance && qualifierDistance.id !== distanceId;

  const updateDistance = async (formData: FormData) => {
    "use server";

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      redirect("/login");
    }

    const label = String(formData.get("label") ?? "").trim();
    const gunTimeRaw = formData.get("gun_time");
    const gunTime =
      gunTimeRaw && String(gunTimeRaw).trim()
        ? new Date(String(gunTimeRaw).trim()).toISOString()
        : null;
    const prCutoffRaw = formData.get("pr_cutoff");
    const prCutoff =
      prCutoffRaw && String(prCutoffRaw).trim()
        ? new Date(String(prCutoffRaw).trim()).toISOString()
        : null;
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

    const { error } = await supabase
      .from("distances")
      .update({
        label,
        gun_time: gunTime,
        pr_cutoff: prCutoff,
        is_peer_racing_qualifier: isQualifier,
        allow_roll_over_from_qualifier: isQualifier ? allowRollOverFrom : false,
        allow_qualifier_split_to_roll_over_here: !isQualifier ? allowQualifierRollOverHere : false,
        allow_pacers: allowPacers,
        pacer_fee_cents: pacerFeeCents,
        entry_fee_cents: entryFeeCents,
      })
      .eq("id", distanceId)
      .eq("event_id", eventId);

    if (error) {
      throw new Error(error.message);
    }

    redirect(`/promoter/events/${eventId}/edit`);
  };

  return (
    <main style={{ padding: 24, maxWidth: 640 }}>
      <h1>Edit distance</h1>
      <p>
        Event: {event.name} · <Link href={`/promoter/events/${eventId}/edit`}>Back to event</Link>
      </p>

      <form action={updateDistance} style={{ marginTop: 24 }}>
        <label htmlFor="label">Label</label>
        <input
          id="label"
          name="label"
          defaultValue={distance.label}
          required
          style={{ display: "block" }}
        />

        <label htmlFor="entry_fee_dollars" style={{ display: "block", marginTop: 8 }}>
          Entry fee ($)
        </label>
        <input
          id="entry_fee_dollars"
          name="entry_fee_dollars"
          type="number"
          min={0}
          step={0.01}
          defaultValue={entryFeeDollarsDefault}
          style={{ display: "block" }}
        />

        <label htmlFor="gun_time" style={{ display: "block", marginTop: 8 }}>
          Gun time
        </label>
        <input
          id="gun_time"
          name="gun_time"
          type="datetime-local"
          defaultValue={gunTimeDefault}
          style={{ display: "block" }}
        />

        <label htmlFor="pr_cutoff" style={{ display: "block", marginTop: 8 }}>
          PR / entry cutoff
        </label>
        <input
          id="pr_cutoff"
          name="pr_cutoff"
          type="datetime-local"
          defaultValue={
            distanceWithExtras.pr_cutoff
              ? new Date(distanceWithExtras.pr_cutoff).toISOString().slice(0, 16)
              : ""
          }
          style={{ display: "block" }}
        />

        <div style={{ marginTop: 24, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <strong>Peer Racing Qualifier</strong>
          <p style={{ fontSize: 14, color: "#555", marginTop: 4 }}>
            Only one race per event can be the Qualifier. Runners can enter the Qualifier and optionally roll their split to other races that allow it.
          </p>
          {isThisQualifier ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 14 }}>This race is the Peer Racing Qualifier.</p>
              <label style={{ display: "block", marginTop: 12, fontSize: 14 }}>
                Would you like to allow roll over splits from this race?
                <select
                  name="allow_roll_over_from_qualifier"
                  defaultValue={(distance as { allow_roll_over_from_qualifier?: boolean }).allow_roll_over_from_qualifier ? "yes" : "no"}
                  style={{ display: "block", marginTop: 4 }}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <input type="hidden" name="is_peer_racing_qualifier" value="1" />
            </div>
          ) : otherIsQualifier ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 14 }}>This event&apos;s Qualifier is <strong>{qualifierDistance!.label}</strong>.</p>
              <label style={{ display: "block", marginTop: 12, fontSize: 14 }}>
                Would you like to allow split for Peer Racing Qualifier to roll over to this race?
                <select
                  name="allow_qualifier_split_to_roll_over_here"
                  defaultValue={(distance as { allow_qualifier_split_to_roll_over_here?: boolean }).allow_qualifier_split_to_roll_over_here ? "yes" : "no"}
                  style={{ display: "block", marginTop: 4 }}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
          ) : (
            <p style={{ fontSize: 14, marginTop: 8 }}>No Qualifier set for this event yet. Set one on another distance to enable roll-over options here.</p>
          )}
        </div>

        <div style={{ marginTop: 24, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <strong>Pacers</strong>
          <p style={{ fontSize: 14, color: "#555", marginTop: 4 }}>Runners can request a registered Peer Racing member as pacer. Pacers do not count in standings or payouts.</p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input
              type="checkbox"
              name="allow_pacers"
              value="1"
              defaultChecked={(distance as { allow_pacers?: boolean }).allow_pacers === true}
            />
            Allow pacers for this distance
          </label>
          <label style={{ display: "block", marginTop: 12, fontSize: 14 }}>
            Pacer fee (cents, $0 allowed)
            <input
              type="number"
              name="pacer_fee_cents"
              min={0}
              defaultValue={(distance as { pacer_fee_cents?: number }).pacer_fee_cents ?? 0}
              style={{ display: "block", marginTop: 4 }}
            />
          </label>
        </div>

        <div style={{ marginTop: 24 }}>
          <button type="submit">Save distance</button>
        </div>
      </form>
    </main>
  );
}
