"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PrizeCategory, PrizeRule, PrizeSettings } from "@/lib/prizes/types";

const DIVISIONS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"] as const;
const CATEGORY_LABELS: Record<PrizeCategory, string> = {
  main: "Main division prizes",
  female: "Female incentive prizes",
  military: "Military incentive prizes",
};
const inputClass =
  "w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

type DistanceOption = { id: string; label: string };
type SettingsForm = {
  main: boolean;
  female: boolean;
  military: boolean;
  showIndividualValues: boolean;
  showTotalValue: boolean;
};
type FulfillmentAward = {
  id: string;
  category: PrizeCategory;
  division: string;
  place: number;
  prize_name: string;
  status: string;
  fulfilled_at: string | null;
  note: string | null;
  racer: { first_name: string; last_name: string; bib: string | null } | null;
};

const defaultSettings: SettingsForm = {
  main: false,
  female: false,
  military: false,
  showIndividualValues: false,
  showTotalValue: true,
};

function dollarsToCents(raw: string): number {
  const n = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function centsToDollars(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2) : "";
}

function enabledKey(category: PrizeCategory): keyof Pick<SettingsForm, "main" | "female" | "military"> {
  return category;
}

export function EventPrizeAwardsClient({
  eventId,
  distances,
}: {
  eventId: string;
  distances: DistanceOption[];
}) {
  const [distanceId, setDistanceId] = useState(distances[0]?.id ?? "");
  const [settings, setSettings] = useState<SettingsForm>(defaultSettings);
  const [rules, setRules] = useState<PrizeRule[]>([]);
  const [category, setCategory] = useState<PrizeCategory>("main");
  const [division, setDivision] = useState<string>("");
  const [places, setPlaces] = useState(3);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [fulfillmentAwards, setFulfillmentAwards] = useState<FulfillmentAward[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!distanceId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/promoter/events/${eventId}/prizes?distanceId=${encodeURIComponent(distanceId)}`,
      );
      const json = (await response.json()) as {
        ok?: boolean;
        error?: string;
        settings?: PrizeSettings | null;
        rules?: PrizeRule[];
        resultsPublishedAt?: string | null;
      };
      if (!response.ok || !json.ok) throw new Error(json.error ?? "Could not load prize settings");
      const saved = json.settings;
      setSettings(
        saved
          ? {
              main: saved.main_prizes_enabled,
              female: saved.female_prizes_enabled,
              military: saved.military_prizes_enabled,
              showIndividualValues: saved.show_individual_retail_values,
              showTotalValue: saved.show_total_award_value,
            }
          : defaultSettings,
      );
      setRules(json.rules ?? []);
      setPublishedAt(json.resultsPublishedAt ?? null);
      if (json.resultsPublishedAt) {
        const fulfillmentResponse = await fetch(
          `/api/promoter/events/${eventId}/prizes/fulfillment?distanceId=${encodeURIComponent(distanceId)}`,
        );
        const fulfillmentJson = (await fulfillmentResponse.json()) as {
          ok?: boolean;
          awards?: FulfillmentAward[];
        };
        setFulfillmentAwards(fulfillmentResponse.ok && fulfillmentJson.ok ? fulfillmentJson.awards ?? [] : []);
      } else {
        setFulfillmentAwards([]);
      }
      setMessage(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load prize settings");
    } finally {
      setLoading(false);
    }
  }, [distanceId, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const maxPlace = rules
      .filter(
        (rule) =>
          rule.category === category &&
          (division ? rule.division === division || rule.division == null : rule.division == null),
      )
      .reduce((max, rule) => Math.max(max, rule.place), 0);
    setPlaces(Math.max(1, maxPlace || 3));
  }, [category, division, rules]);

  const rulesAt = useCallback(
    (place: number) => {
      const exact = rules.filter(
        (rule) => rule.category === category && rule.division === (division || null) && rule.place === place,
      );
      if (exact.length > 0 || !division) return { rules: exact, inherited: false };
      return {
        rules: rules.filter(
          (rule) => rule.category === category && rule.division == null && rule.place === place,
        ),
        inherited: true,
      };
    },
    [category, division, rules],
  );

  const totals = useMemo(
    () => ({
      cost: rules.reduce((sum, rule) => sum + rule.cost_cents, 0),
      retail: rules.reduce((sum, rule) => sum + rule.retail_value_cents, 0),
    }),
    [rules],
  );

  function replacePlace(place: number, next: PrizeRule[]) {
    setRules((current) => [
      ...current.filter(
        (rule) => !(rule.category === category && rule.division === (division || null) && rule.place === place),
      ),
      ...next.map((rule, index) => ({
        ...rule,
        category,
        division: division || null,
        place,
        sort_order: index,
      })),
    ]);
  }

  function customizePlace(place: number) {
    const current = rulesAt(place).rules;
    replacePlace(
      place,
      current.map((rule) => ({ ...rule, id: undefined })),
    );
  }

  function addPrize(place: number) {
    const current = rulesAt(place);
    const base = current.inherited ? current.rules.map((rule) => ({ ...rule, id: undefined })) : current.rules;
    replacePlace(place, [
      ...base,
      {
        category,
        division: division || null,
        place,
        sort_order: base.length,
        prize_name: "",
        cost_cents: 0,
        retail_value_cents: 0,
      },
    ]);
  }

  async function save() {
    const cleanRules = rules.filter((rule) => rule.prize_name.trim());
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/promoter/events/${eventId}/prizes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distance_id: distanceId,
          main_prizes_enabled: settings.main,
          female_prizes_enabled: settings.female,
          military_prizes_enabled: settings.military,
          show_individual_retail_values: settings.showIndividualValues,
          show_total_award_value: settings.showTotalValue,
          rules: cleanRules,
        }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string; requiresRepublish?: boolean };
      if (!response.ok || !json.ok) throw new Error(json.error ?? "Save failed");
      setRules(cleanRules);
      setMessage(
        json.requiresRepublish
          ? "Saved. Results are still showing the previous prizes—re-publish them from the Results Console."
          : "Prize settings saved.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveFulfillment(award: FulfillmentAward) {
    setError(null);
    try {
      const response = await fetch(`/api/promoter/events/${eventId}/prizes/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distance_id: distanceId,
          award_id: award.id,
          status: award.status,
          note: award.note,
        }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error ?? "Could not update prize");
      setMessage(`${award.prize_name} fulfillment updated.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update prize");
    }
  }

  if (distances.length === 0) return null;

  return (
    <section className="rounded-xl border border-[#E87722]/25 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#E87722]">Physical awards</p>
          <h2 className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">Prize Schedule</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#1E3A5F]/70">
            Build one shared schedule for every division, then override only the places that differ. Add as many prizes
            as needed to one place. Cost stays private; retail value can be advertised.
          </p>
        </div>
        <label className="min-w-52 text-sm font-medium text-[#1E3A5F]">
          Distance
          <select className={`${inputClass} mt-1`} value={distanceId} onChange={(e) => setDistanceId(e.target.value)}>
            {distances.map((distance) => (
              <option key={distance.id} value={distance.id}>
                {distance.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="mt-6 text-sm text-[#1E3A5F]/65">Loading prizes…</p> : null}
      {!loading ? (
        <>
          {publishedAt ? (
            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
              Results are published. Saving prize changes does not alter the live results until you re-publish from the
              Results Console. Pickup status is preserved separately.
            </p>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {(["main", "female", "military"] as PrizeCategory[]).map((key) => (
              <label key={key} className="flex items-center gap-3 rounded-lg border border-[#1E3A5F]/15 p-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#E87722]"
                  checked={settings[enabledKey(key)]}
                  onChange={(e) => setSettings((value) => ({ ...value, [enabledKey(key)]: e.target.checked }))}
                />
                <span className="font-medium text-[#1E3A5F]">{CATEGORY_LABELS[key]}</span>
              </label>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border border-[#1E3A5F]/15 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#E87722]"
                checked={settings.showIndividualValues}
                onChange={(e) => setSettings((value) => ({ ...value, showIndividualValues: e.target.checked }))}
              />
              <span>
                <span className="font-medium text-[#1E3A5F]">Show retail value beside each prize</span>
                <span className="mt-0.5 block text-xs text-[#1E3A5F]/60">Example: Yeti Cooler ($350 value)</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-[#1E3A5F]/15 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#E87722]"
                checked={settings.showTotalValue}
                onChange={(e) => setSettings((value) => ({ ...value, showTotalValue: e.target.checked }))}
              />
              <span>
                <span className="font-medium text-[#1E3A5F]">Show combined cash and prize value</span>
                <span className="mt-0.5 block text-xs text-[#1E3A5F]/60">Uses the stated retail value, not company cost.</span>
              </span>
            </label>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-[#1E3A5F]">
              Award group
              <select className={`${inputClass} mt-1`} value={category} onChange={(e) => setCategory(e.target.value as PrizeCategory)}>
                {(Object.keys(CATEGORY_LABELS) as PrizeCategory[]).map((key) => (
                  <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-[#1E3A5F]">
              Schedule
              <select className={`${inputClass} mt-1`} value={division} onChange={(e) => setDivision(e.target.value)}>
                <option value="">Shared by all divisions</option>
                {DIVISIONS.map((name) => <option key={name} value={name}>{name} override</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-[#1E3A5F]">
              Places offering prizes
              <select
                className={`${inputClass} mt-1`}
                value={places}
                disabled={Boolean(division)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setPlaces(next);
                  setRules((current) =>
                    current.filter(
                      (rule) => !(rule.category === category && rule.division == null && rule.place > next),
                    ),
                  );
                }}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((place) => (
                  <option key={place} value={place}>{place}</option>
                ))}
              </select>
              {division ? <span className="mt-1 block text-[10px] font-normal text-[#1E3A5F]/55">Set depth on the shared schedule.</span> : null}
            </label>
          </div>

          <div className="mt-6 space-y-4">
            {Array.from({ length: places }, (_, index) => index + 1).map((place) => {
              const atPlace = rulesAt(place);
              return (
                <div key={`${category}-${division}-${place}`} className="rounded-lg border border-[#1E3A5F]/15 bg-[#fafbfc] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display font-semibold text-[#1E3A5F]">{place}{place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"} place</p>
                    {atPlace.inherited && atPlace.rules.length > 0 ? (
                      <button type="button" className="text-xs font-semibold text-[#E87722] hover:underline" onClick={() => customizePlace(place)}>
                        Customize for {division}
                      </button>
                    ) : null}
                  </div>
                  {atPlace.inherited && atPlace.rules.length > 0 ? (
                    <p className="mt-1 text-xs text-[#1E3A5F]/55">Currently inherited from the shared schedule.</p>
                  ) : null}
                  <div className="mt-3 space-y-3">
                    {atPlace.rules.map((rule, ruleIndex) => (
                      <div key={`${place}-${rule.id ?? `new-${ruleIndex}`}`} className="grid gap-2 rounded-lg bg-white p-3 ring-1 ring-[#1E3A5F]/10 sm:grid-cols-[1fr_9rem_9rem_auto]">
                        <input
                          className={inputClass}
                          aria-label="Prize name"
                          placeholder="Prize name"
                          disabled={atPlace.inherited}
                          value={rule.prize_name}
                          onChange={(e) => replacePlace(place, atPlace.rules.map((item, i) => i === ruleIndex ? { ...item, prize_name: e.target.value } : item))}
                        />
                        <input
                          className={inputClass}
                          aria-label="Company cost"
                          placeholder="Cost $"
                          inputMode="decimal"
                          disabled={atPlace.inherited}
                          value={centsToDollars(rule.cost_cents)}
                          onChange={(e) => replacePlace(place, atPlace.rules.map((item, i) => i === ruleIndex ? { ...item, cost_cents: dollarsToCents(e.target.value) } : item))}
                        />
                        <input
                          className={inputClass}
                          aria-label="Retail value"
                          placeholder="Retail $"
                          inputMode="decimal"
                          disabled={atPlace.inherited}
                          value={centsToDollars(rule.retail_value_cents)}
                          onChange={(e) => replacePlace(place, atPlace.rules.map((item, i) => i === ruleIndex ? { ...item, retail_value_cents: dollarsToCents(e.target.value) } : item))}
                        />
                        {!atPlace.inherited ? (
                          <button type="button" className="rounded-md px-2 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => replacePlace(place, atPlace.rules.filter((_, i) => i !== ruleIndex))}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {!atPlace.inherited ? (
                      <button type="button" className="rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722]" onClick={() => addPrize(place)}>
                        + Add prize to {place} place
                      </button>
                    ) : null}
                    {atPlace.inherited && atPlace.rules.length === 0 ? (
                      <button type="button" className="rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-xs font-semibold text-[#1E3A5F]" onClick={() => addPrize(place)}>
                        + Add {division} override
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#1E3A5F]/10 pt-5">
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving…" : "Save prize schedule"}
            </button>
            <span className="text-xs text-[#1E3A5F]/60">
              Entered template totals: company cost ${(totals.cost / 100).toLocaleString()} · retail ${(totals.retail / 100).toLocaleString()}
            </span>
          </div>
          {message ? <p className="mt-3 text-sm font-medium text-emerald-800">{message}</p> : null}
          {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}

          {publishedAt && fulfillmentAwards.length > 0 ? (
            <div className="mt-8 border-t border-[#1E3A5F]/10 pt-7">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="font-display text-xl font-bold text-[#1E3A5F]">Prize Pickup & Delivery</h3>
                  <p className="mt-1 text-xs text-[#1E3A5F]/65">
                    Private operations log. These updates do not require re-publishing results.
                  </p>
                </div>
                <p className="text-xs font-semibold text-[#1E3A5F]/65">
                  {fulfillmentAwards.filter((award) => award.status === "awaiting_pickup").length} awaiting pickup
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {fulfillmentAwards.map((award) => (
                  <div key={award.id} className="grid gap-3 rounded-lg border border-[#1E3A5F]/15 bg-[#fafbfc] p-4 lg:grid-cols-[1.2fr_12rem_1fr_auto] lg:items-end">
                    <div>
                      <p className="text-sm font-semibold text-[#1E3A5F]">
                        {award.racer ? `${award.racer.first_name} ${award.racer.last_name}` : "Unknown racer"}
                        {award.racer?.bib ? <span className="font-normal text-[#1E3A5F]/55"> · Bib {award.racer.bib}</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-[#1E3A5F]/65">
                        {award.prize_name} · {award.category} · {award.division} {award.place}
                      </p>
                    </div>
                    <label className="text-xs font-medium text-[#1E3A5F]">
                      Status
                      <select
                        className={`${inputClass} mt-1`}
                        value={award.status}
                        onChange={(e) =>
                          setFulfillmentAwards((current) =>
                            current.map((item) => item.id === award.id ? { ...item, status: e.target.value } : item),
                          )
                        }
                      >
                        <option value="awaiting_pickup">Awaiting pickup</option>
                        <option value="picked_up">Picked up</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="waived">Waived</option>
                        <option value="forfeited">Forfeited</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium text-[#1E3A5F]">
                      Note
                      <input
                        className={`${inputClass} mt-1`}
                        placeholder="Picked up by Jenny's husband"
                        value={award.note ?? ""}
                        onChange={(e) =>
                          setFulfillmentAwards((current) =>
                            current.map((item) => item.id === award.id ? { ...item, note: e.target.value } : item),
                          )
                        }
                      />
                    </label>
                    <button type="button" className="rounded-lg border border-[#1E3A5F]/25 bg-white px-3 py-2 text-xs font-semibold text-[#1E3A5F]" onClick={() => void saveFulfillment(award)}>
                      Save
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
