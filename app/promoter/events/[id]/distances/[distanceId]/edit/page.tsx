import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { toDatetimeLocalInputValue } from "@/lib/datetime-local";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

const selectClass = `${inputClass} cursor-pointer`;

export default async function EditDistancePage({
  params,
}: {
  params: Promise<{ id: string; distanceId: string }>;
}) {
  const { id: eventId, distanceId } = await params;
  const returnUrl = `/promoter/events/${eventId}/distances/${distanceId}/edit`;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
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
    .select(
      "id,label,gun_time,pr_cutoff,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here,allow_pacers,pacer_fee_cents,entry_fee_cents",
    )
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

  const distanceWithExtras = distance as typeof distance & {
    sort_order?: number;
    gun_time?: string;
    pr_cutoff?: string;
    entry_fee_cents?: number;
  };
  const entryFeeDollarsDefault = ((distanceWithExtras.entry_fee_cents ?? 0) / 100).toFixed(2);
  const gunTimeDefault = toDatetimeLocalInputValue(distanceWithExtras.gun_time ?? null);
  const isThisQualifier =
    (distance as { is_peer_racing_qualifier?: boolean }).is_peer_racing_qualifier === true;
  const otherIsQualifier = qualifierDistance && qualifierDistance.id !== distanceId;

  const updateDistance = async (formData: FormData) => {
    "use server";

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
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
    const allowRollOverFrom =
      String(formData.get("allow_roll_over_from_qualifier") ?? "").toLowerCase() === "yes";
    const allowQualifierRollOverHere =
      String(formData.get("allow_qualifier_split_to_roll_over_here") ?? "").toLowerCase() === "yes";
    const allowPacers = formData.get("allow_pacers") === "1";
    const pacerFeeDollarsRaw = formData.get("pacer_fee_dollars");
    const pacerFeeCents = (() => {
      if (pacerFeeDollarsRaw == null || String(pacerFeeDollarsRaw).trim() === "") return 0;
      const d = parseFloat(String(pacerFeeDollarsRaw).replace(/[$,\s]/g, ""));
      if (Number.isNaN(d) || d < 0) return 0;
      return Math.round(d * 100);
    })();
    const entryFeeDollarsRaw = formData.get("entry_fee_dollars");
    const entryFeeCents = (() => {
      if (entryFeeDollarsRaw == null || String(entryFeeDollarsRaw).trim() === "") return 0;
      const d = parseFloat(String(entryFeeDollarsRaw).replace(/[$,\s]/g, ""));
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
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href={`/promoter/events/${eventId}/edit`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to event
        </Link>

        <div className="mt-6 border-b border-[#1E3A5F]/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
            Edit Distance
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            {distance.label}
          </h1>
          <p className="mt-2 text-sm text-[#1E3A5F]/75">{event.name}</p>
        </div>

        <div className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm sm:p-8">
          <form action={updateDistance} className="space-y-5">
            <div>
              <label htmlFor="label" className="text-sm font-medium text-[#1E3A5F]">
                Label
              </label>
              <input
                id="label"
                name="label"
                defaultValue={distance.label}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="entry_fee_dollars" className="text-sm font-medium text-[#1E3A5F]">
                Entry fee ($)
              </label>
              <input
                id="entry_fee_dollars"
                name="entry_fee_dollars"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={entryFeeDollarsDefault}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="gun_time" className="text-sm font-medium text-[#1E3A5F]">
                Gun time <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
              </label>
              <input
                id="gun_time"
                name="gun_time"
                type="datetime-local"
                defaultValue={gunTimeDefault}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="pr_cutoff" className="text-sm font-medium text-[#1E3A5F]">
                Entry deadline <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
              </label>
              <input
                id="pr_cutoff"
                name="pr_cutoff"
                type="datetime-local"
                defaultValue={toDatetimeLocalInputValue(distanceWithExtras.pr_cutoff ?? null)}
                className={inputClass}
              />
            </div>

            <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
              <p className="font-display text-base font-semibold text-[#1E3A5F]">
                Peer Racing Qualifier
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#1E3A5F]/70">
                You may have only one Qualifier per event. Runners can enter the Qualifier and
                optionally roll their split to other races you allow below.
              </p>
              {isThisQualifier ? (
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-[#1E3A5F]">This race is the Peer Racing Qualifier.</p>
                  <div>
                    <label
                      htmlFor="allow_roll_over_from_qualifier"
                      className="text-sm font-medium text-[#1E3A5F]"
                    >
                      Allow roll-over splits from this Qualifier?
                    </label>
                    <select
                      id="allow_roll_over_from_qualifier"
                      name="allow_roll_over_from_qualifier"
                      className={selectClass}
                      defaultValue={
                        (distance as { allow_roll_over_from_qualifier?: boolean })
                          .allow_roll_over_from_qualifier
                          ? "yes"
                          : "no"
                      }
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <input type="hidden" name="is_peer_racing_qualifier" value="1" />
                </div>
              ) : otherIsQualifier ? (
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-[#1E3A5F]">
                    This event&apos;s Peer Racing Qualifier is{" "}
                    <strong className="font-semibold">{qualifierDistance!.label}</strong>.
                  </p>
                  <div>
                    <label
                      htmlFor="allow_qualifier_split_to_roll_over_here"
                      className="text-sm font-medium text-[#1E3A5F]"
                    >
                      Allow Qualifier split to roll over to this race?
                    </label>
                    <select
                      id="allow_qualifier_split_to_roll_over_here"
                      name="allow_qualifier_split_to_roll_over_here"
                      className={selectClass}
                      defaultValue={
                        (distance as { allow_qualifier_split_to_roll_over_here?: boolean })
                          .allow_qualifier_split_to_roll_over_here
                          ? "yes"
                          : "no"
                      }
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#1E3A5F]/70">
                  No Qualifier set for this event yet. Set one on another distance to enable
                  roll-over options here.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
              <p className="font-display text-base font-semibold text-[#1E3A5F]">Pacers</p>
              <p className="mt-2 text-sm text-[#1E3A5F]/70">
                Runners can request a registered Peer Racing member as pacer. Pacers do not count in
                standings or payouts.
              </p>
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[#1E3A5F]">
                <input
                  type="checkbox"
                  name="allow_pacers"
                  value="1"
                  defaultChecked={(distance as { allow_pacers?: boolean }).allow_pacers === true}
                  className="h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
                />
                Allow pacers for this distance
              </label>
              <div className="mt-4">
                <label htmlFor="pacer_fee_dollars" className="text-sm font-medium text-[#1E3A5F]">
                  Pacer Fee (in whole dollars. 0 if no pacer fee)
                </label>
                <input
                  id="pacer_fee_dollars"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  name="pacer_fee_dollars"
                  defaultValue={String(
                    ((distance as { pacer_fee_cents?: number }).pacer_fee_cents ?? 0) / 100,
                  )}
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 sm:w-auto"
            >
              Save distance
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
