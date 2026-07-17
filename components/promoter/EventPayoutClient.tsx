"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** Allow typing whole-dollar amounts naturally (e.g. 100 → $100) without per-keystroke reformatting. */
function sanitizeDollarInput(raw: string): string {
  const s = raw.replace(/[$,\s]/g, "").replace(/[^\d.]/g, "");
  if (s === "") return "";
  const firstDot = s.indexOf(".");
  if (firstDot === -1) return s;
  const intPart = s.slice(0, firstDot).replace(/\./g, "");
  let decPart = s.slice(firstDot + 1).replace(/\./g, "");
  decPart = decPart.slice(0, 2);
  if (decPart.length > 0) return `${intPart}.${decPart}`;
  return `${intPart}.`;
}

function parseDollarStringToCents(s: string): number {
  const t = s.trim();
  if (t === "" || t === ".") return 0;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function centsToDollarInputString(cents: number): string {
  if (cents <= 0) return "";
  const d = cents / 100;
  if (Number.isInteger(d)) return String(d);
  return d.toFixed(2);
}

import {
  calculateEventPayout,
  defaultDistancePayoutSettings,
  entryCountToBracket,
  PAYOUT_BRACKET_ORDER,
  PAYOUT_SCHEDULE,
} from "@/lib/payout";
import { calculateNumDivisions, calculateNumPayoutSlots } from "@/lib/algorithm";
import type { DistancePayoutSettingsRow, PayoutBracketId, PayoutCalculationInput } from "@/lib/payout/types";
import {
  rulesForPlacement,
  type PrizeCategory,
  type PrizeRule,
  type PrizeSettings,
} from "@/lib/prizes/types";

function fmtUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** Ledger / running-balance amounts; negative cents render in red (real shortfall until entries catch up). */
function LedgerDd({ cents }: { cents: number }) {
  return (
    <dd
      className={
        cents < 0
          ? "text-right font-semibold text-red-600 tabular-nums"
          : "text-right tabular-nums text-[#1E3A5F]"
      }
    >
      {fmtUsd(cents)}
    </dd>
  );
}

function maxPrizePlace(
  rules: PrizeRule[],
  category: PrizeCategory,
  division: string,
): number {
  let max = 0;
  for (let place = 1; place <= SCHEDULE_PLACES_TO_PAY; place++) {
    if (rulesForPlacement(rules, category, division, place).length > 0) max = place;
  }
  return max;
}

function DivisionAwardLines({
  category,
  division,
  cashPlaces,
  prizeRules,
  prizesEnabled,
}: {
  category: PrizeCategory;
  division: string;
  cashPlaces: Array<{ place: number; amountCents: number }>;
  prizeRules: PrizeRule[];
  prizesEnabled: boolean;
}) {
  const lines = Array.from({ length: SCHEDULE_PLACES_TO_PAY }, (_, index) => {
    const place = index + 1;
    const cash = cashPlaces.find((item) => item.place === place)?.amountCents ?? 0;
    const prizes = prizesEnabled ? rulesForPlacement(prizeRules, category, division, place) : [];
    return { place, cash, prizes };
  }).filter((line) => line.cash > 0 || line.prizes.length > 0);

  if (lines.length === 0) {
    return <p className="mt-3 text-xs text-[#1E3A5F]/50">No cash or physical prizes configured.</p>;
  }

  return (
    <ul className="mt-3 divide-y divide-[#1E3A5F]/10 text-sm">
      {lines.map((line) => (
        <li key={line.place} className="grid grid-cols-[5rem_1fr] gap-2 py-2">
          <span className="text-[#1E3A5F]/80">{line.place} place</span>
          <span className="text-right">
            {line.cash > 0 ? (
              <span className="block font-semibold text-[#1E3A5F]">{fmtUsd(line.cash)} cash</span>
            ) : null}
            {line.prizes.map((prize) => (
              <span key={`${prize.id ?? prize.sort_order}-${prize.prize_name}`} className="block text-xs text-[#E87722]">
                {prize.prize_name}
                <span className="text-[#1E3A5F]/55">
                  {" "}
                  · cost {fmtUsd(prize.cost_cents)} · retail {fmtUsd(prize.retail_value_cents)}
                </span>
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Divisions are always named in this order; only the count (1–5) varies. */
const DIVISION_NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"] as const;
const MAX_DIVISIONS = DIVISION_NAMES.length;

/** Full PR schedule columns use up to 12 place rows; weights are zero where the sheet leaves a hole empty. */
const SCHEDULE_PLACES_TO_PAY = 12;

function divisionLabelsForCount(count: number): string[] {
  const c = Math.max(1, Math.min(MAX_DIVISIONS, Math.floor(count)));
  return [...DIVISION_NAMES.slice(0, c)];
}

/** Dropdown label for a schedule column: entrant band + how many holes that column pays. */
function bracketOptionLabel(b: PayoutBracketId): string {
  const holes = PAYOUT_SCHEDULE[b].filter((w) => w != null && w > 0).length;
  return `${b} entrants — pays ${holes} ${holes === 1 ? "hole" : "holes"}`;
}

type DistanceOption = { id: string; label: string; entry_fee_cents: number };

type FormState = {
  cashPayoutsEnabled: boolean;
  cashPayoutMode: "entry_based" | "guaranteed";
  guaranteedCashPayoutCents: number;
  entryCount: number;
  entryFeeCents: number;
  processingFeePercent: number;
  shootoutPercent: number;
  prHoldingPercent: number;
  producerShareOfPrPercent: number;
  trueAddedMoneyCents: number;
  femaleIncentiveCents: number;
  femaleIncentiveDivisionCount: number;
  femaleIncentiveScheduleMode: "auto" | "manual";
  femaleIncentiveManualBracket: PayoutBracketId;
  militaryIncentiveCents: number;
  militaryIncentiveDivisionCount: number;
  militaryIncentiveScheduleMode: "auto" | "manual";
  militaryIncentiveManualBracket: PayoutBracketId;
  marketingFemaleEntryCount: number;
  marketingMilitaryEntryCount: number;
  eliteDivisionCarveCents: number;
  divisionCount: number;
  eliteDivisionIndex: number;
  scheduleMode: "auto" | "manual";
  manualBracket: PayoutBracketId;
};

function rowToForm(
  row: DistancePayoutSettingsRow | null,
  liveEntryCount: number,
  liveFeeCents: number,
  liveFemaleEntryCount: number,
  liveMilitaryEntryCount: number,
): FormState {
  const d = defaultDistancePayoutSettings("00000000-0000-0000-0000-000000000000");
  const r = row
    ? (() => {
        const divisionCount = Math.min(MAX_DIVISIONS, Math.max(1, row.division_count));
        const eliteDivisionIndex = Math.min(divisionCount - 1, Math.max(0, row.elite_division_index));
        return {
          cashPayoutsEnabled: row.cash_payouts_enabled !== false,
          cashPayoutMode: row.cash_payout_mode ?? "entry_based",
          guaranteedCashPayoutCents: row.guaranteed_cash_payout_cents ?? 0,
          entryCount: row.marketing_entry_count ?? row.entry_count_override ?? liveEntryCount,
          entryFeeCents: row.marketing_entry_fee_cents ?? row.entry_fee_cents_override ?? liveFeeCents,
          processingFeePercent: Number(row.processing_fee_fraction) * 100,
          shootoutPercent: Number(row.shootout_fraction ?? 0) * 100,
          prHoldingPercent: Number(row.pr_holding_fraction) * 100,
          producerShareOfPrPercent: Number(row.producer_fraction_of_pr_holding) * 100,
          trueAddedMoneyCents: row.true_added_money_cents,
          femaleIncentiveCents: row.female_incentive_cents ?? 0,
          femaleIncentiveDivisionCount: Math.min(
            MAX_DIVISIONS,
            Math.max(1, Math.floor(Number(row.female_incentive_division_count ?? 1))),
          ),
          femaleIncentiveScheduleMode: row.female_incentive_schedule_mode ?? "auto",
          femaleIncentiveManualBracket: (row.female_incentive_manual_bracket as PayoutBracketId) ?? "91-120",
          militaryIncentiveCents: row.military_incentive_cents ?? 0,
          militaryIncentiveDivisionCount: Math.min(
            MAX_DIVISIONS,
            Math.max(1, Math.floor(Number(row.military_incentive_division_count ?? 1))),
          ),
          militaryIncentiveScheduleMode: row.military_incentive_schedule_mode ?? "auto",
          militaryIncentiveManualBracket: (row.military_incentive_manual_bracket as PayoutBracketId) ?? "91-120",
          marketingFemaleEntryCount: row.marketing_female_entry_count ?? liveFemaleEntryCount,
          marketingMilitaryEntryCount: row.marketing_military_entry_count ?? liveMilitaryEntryCount,
          eliteDivisionCarveCents: row.elite_division_carve_cents,
          divisionCount,
          eliteDivisionIndex,
          scheduleMode: row.schedule_mode,
          manualBracket: (row.manual_bracket as PayoutBracketId) ?? "91-120",
        };
      })()
    : {
        cashPayoutsEnabled: true,
        cashPayoutMode: "entry_based",
        guaranteedCashPayoutCents: 0,
        entryCount: liveEntryCount,
        entryFeeCents: liveFeeCents,
        processingFeePercent: d.processing_fee_fraction * 100,
        shootoutPercent: (d.shootout_fraction ?? 0) * 100,
        prHoldingPercent: d.pr_holding_fraction * 100,
        producerShareOfPrPercent: d.producer_fraction_of_pr_holding * 100,
        trueAddedMoneyCents: 0,
        femaleIncentiveCents: 0,
        femaleIncentiveDivisionCount: 1,
        femaleIncentiveScheduleMode: "auto" as const,
        femaleIncentiveManualBracket: "91-120",
        militaryIncentiveCents: 0,
        militaryIncentiveDivisionCount: 1,
        militaryIncentiveScheduleMode: "auto" as const,
        militaryIncentiveManualBracket: "91-120",
        marketingFemaleEntryCount: liveFemaleEntryCount,
        marketingMilitaryEntryCount: liveMilitaryEntryCount,
        eliteDivisionCarveCents: 0,
        divisionCount: 5,
        eliteDivisionIndex: 0,
        scheduleMode: "auto" as const,
        manualBracket: "91-120",
      };
  return r as FormState;
}

function formToInput(f: FormState): PayoutCalculationInput {
  return {
    cashPayoutMode: f.cashPayoutsEnabled ? f.cashPayoutMode : "entry_based",
    guaranteedCashPayoutCents: f.cashPayoutsEnabled ? f.guaranteedCashPayoutCents : 0,
    entryCount: f.entryCount,
    entryFeeCents: f.entryFeeCents,
    processingFeeFraction: f.processingFeePercent / 100,
    shootoutFraction: f.shootoutPercent / 100,
    prHoldingFraction: f.cashPayoutsEnabled ? f.prHoldingPercent / 100 : 1,
    producerFractionOfPrHolding: f.producerShareOfPrPercent / 100,
    trueAddedMoneyCents: f.cashPayoutsEnabled ? f.trueAddedMoneyCents : 0,
    femaleIncentiveFromRacersPotCents: f.cashPayoutsEnabled ? f.femaleIncentiveCents : 0,
    femaleIncentiveDivisionCount: f.femaleIncentiveDivisionCount,
    femaleIncentivePlacesToPay: SCHEDULE_PLACES_TO_PAY,
    femaleIncentiveDivisionLabels: divisionLabelsForCount(f.femaleIncentiveDivisionCount),
    femaleIncentiveScheduleMode: f.femaleIncentiveScheduleMode,
    femaleIncentiveManualBracket:
      f.femaleIncentiveScheduleMode === "manual" ? f.femaleIncentiveManualBracket : undefined,
    femaleIncentiveBracketEntryCount: Math.max(0, f.marketingFemaleEntryCount),
    militaryIncentiveFromRacersPotCents: f.cashPayoutsEnabled ? f.militaryIncentiveCents : 0,
    militaryIncentiveDivisionCount: f.militaryIncentiveDivisionCount,
    militaryIncentivePlacesToPay: SCHEDULE_PLACES_TO_PAY,
    militaryIncentiveDivisionLabels: divisionLabelsForCount(f.militaryIncentiveDivisionCount),
    militaryIncentiveScheduleMode: f.militaryIncentiveScheduleMode,
    militaryIncentiveManualBracket:
      f.militaryIncentiveScheduleMode === "manual" ? f.militaryIncentiveManualBracket : undefined,
    militaryIncentiveBracketEntryCount: Math.max(0, f.marketingMilitaryEntryCount),
    eliteDivisionCarveFromPoolCents: f.cashPayoutsEnabled ? f.eliteDivisionCarveCents : 0,
    divisionCount: f.divisionCount,
    eliteDivisionIndex: f.eliteDivisionIndex,
    scheduleMode: f.scheduleMode,
    manualBracket: f.scheduleMode === "manual" ? f.manualBracket : undefined,
    placesToPay: SCHEDULE_PLACES_TO_PAY,
    divisionLabels: divisionLabelsForCount(f.divisionCount),
  };
}

const inputClass =
  "mt-1 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

/**
 * Division count picker (1–5). A native <select> instead of a number input:
 * desktop gets a dropdown, mobile gets the OS wheel picker — number-input
 * spinner arrows are unusable on phones.
 */
function DivisionCountSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block text-sm font-medium text-[#1E3A5F]">
      {label}
      <select
        className={inputClass}
        value={Math.max(1, Math.min(MAX_DIVISIONS, Math.floor(value)))}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {DIVISION_NAMES.map((name, i) => {
          const n = i + 1;
          const range = n === 1 ? name : `${DIVISION_NAMES[0]}–${name}`;
          return (
            <option key={n} value={n}>
              {n} — {range}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function PercentField({
  label,
  hint,
  value,
  onChange,
  step = 0.1,
  max = 100,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  max?: number;
}) {
  return (
    <label className="block text-sm font-medium text-[#1E3A5F]">
      {label}
      {hint ? <span className="mt-0.5 block text-xs font-normal text-[#1E3A5F]/60">{hint}</span> : null}
      <div className="relative mt-1">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={0}
          max={max}
          className={`${inputClass} pr-9 tabular-nums`}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#1E3A5F]/45"
          aria-hidden
        >
          %
        </span>
      </div>
    </label>
  );
}

function DollarField({
  label,
  hint,
  cents,
  onChangeCents,
  disabled,
}: {
  label: string;
  hint?: string;
  cents: number;
  onChangeCents: (n: number) => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const displayValue = focused ? draft : centsToDollarInputString(cents);

  return (
    <label className={`block text-sm font-medium text-[#1E3A5F] ${disabled ? "opacity-70" : ""}`}>
      {label}
      {hint ? <span className="mt-0.5 block text-xs font-normal text-[#1E3A5F]/60">{hint}</span> : null}
      <div className="relative mt-1">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#1E3A5F]/50"
          aria-hidden
        >
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          className={`${inputClass} pl-8 tabular-nums`}
          value={displayValue}
          onFocus={() => {
            setFocused(true);
            setDraft(centsToDollarInputString(cents));
          }}
          onBlur={() => {
            setFocused(false);
            setDraft((d) => {
              const centsVal = parseDollarStringToCents(d);
              // Never call parent setState inside another component's setState updater — it can run during render.
              queueMicrotask(() => onChangeCents(centsVal));
              return "";
            });
          }}
          onChange={(e) => {
            const next = sanitizeDollarInput(e.target.value);
            setDraft(next);
            onChangeCents(parseDollarStringToCents(next));
          }}
        />
      </div>
    </label>
  );
}

export function EventPayoutClient({
  eventId,
  distances,
}: {
  eventId: string;
  distances: DistanceOption[];
}) {
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>(distances[0]?.id ?? "");
  const [liveEntryCount, setLiveEntryCount] = useState(0);
  const [liveFeeCents, setLiveFeeCents] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState(distances[0]?.label ?? "");
  const [form, setForm] = useState<FormState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [checkedInPaidCount, setCheckedInPaidCount] = useState(0);
  const [checkedInFemaleCount, setCheckedInFemaleCount] = useState(0);
  const [checkedInMilitaryCount, setCheckedInMilitaryCount] = useState(0);
  const [femaleEntryCount, setFemaleEntryCount] = useState(0);
  const [militaryEntryCount, setMilitaryEntryCount] = useState(0);
  const [prizeSettings, setPrizeSettings] = useState<PrizeSettings | null>(null);
  const [prizeRules, setPrizeRules] = useState<PrizeRule[]>([]);

  const loadDistance = useCallback(async () => {
    if (!selectedDistanceId) {
      setForm(null);
      setPrizeSettings(null);
      setPrizeRules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setPrizeSettings(null);
    setPrizeRules([]);
    try {
      const [res, prizeRes] = await Promise.all([
        fetch(`/api/promoter/events/${eventId}/payout?distanceId=${encodeURIComponent(selectedDistanceId)}`),
        fetch(`/api/promoter/events/${eventId}/prizes?distanceId=${encodeURIComponent(selectedDistanceId)}`),
      ]);
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        settings?: DistancePayoutSettingsRow | null;
        suggestedEntryCount?: number;
        suggestedFeeCents?: number;
        distance?: { label: string };
        checkedInCount?: number;
        checkedInPaidCount?: number;
        checkedInFemaleCount?: number;
        checkedInMilitaryCount?: number;
        femaleEntryCount?: number;
        militaryEntryCount?: number;
      };
      const prizeJson = (await prizeRes.json()) as {
        ok?: boolean;
        settings?: PrizeSettings | null;
        rules?: PrizeRule[];
      };
      if (!res.ok || !json.ok) {
        setLoadError(json.error ?? "Could not load payout data");
        setForm(null);
        return;
      }
      const liveC = json.suggestedEntryCount ?? 0;
      const liveF = json.suggestedFeeCents ?? 0;
      setLiveEntryCount(liveC);
      setLiveFeeCents(liveF);
      setFemaleEntryCount(json.femaleEntryCount ?? 0);
      setMilitaryEntryCount(json.militaryEntryCount ?? 0);
      setCheckedInCount(json.checkedInCount ?? 0);
      setCheckedInPaidCount(json.checkedInPaidCount ?? 0);
      setCheckedInFemaleCount(json.checkedInFemaleCount ?? 0);
      setCheckedInMilitaryCount(json.checkedInMilitaryCount ?? 0);
      if (json.distance?.label) setSelectedLabel(json.distance.label);
      setForm(
        rowToForm(
          json.settings ?? null,
          liveC,
          liveF,
          json.femaleEntryCount ?? 0,
          json.militaryEntryCount ?? 0,
        ),
      );
      if (prizeRes.ok && prizeJson.ok) {
        setPrizeSettings(prizeJson.settings ?? null);
        setPrizeRules(prizeJson.rules ?? []);
      } else {
        setPrizeSettings(null);
        setPrizeRules([]);
      }
    } catch {
      setLoadError("Network error");
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, [eventId, selectedDistanceId]);

  useEffect(() => {
    void loadDistance();
  }, [loadDistance]);

  useEffect(() => {
    const receiveSavedPrizes = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          distanceId: string;
          settings: PrizeSettings | null;
          rules: PrizeRule[];
        }>
      ).detail;
      if (!detail || detail.distanceId !== selectedDistanceId) return;
      setPrizeSettings(detail.settings);
      setPrizeRules(detail.rules);
    };
    window.addEventListener("peer-racing:prizes-saved", receiveSavedPrizes);
    return () => window.removeEventListener("peer-racing:prizes-saved", receiveSavedPrizes);
  }, [selectedDistanceId]);

  const result = useMemo(
    () =>
      form
        ? calculateEventPayout(formToInput(form))
        : null,
    [form],
  );

  /** Marketing headline number: every place that pays a check, across main divisions and both incentive pools. */
  const checksPaidCount = useMemo(() => {
    if (!result) return 0;
    const countPlaces = (divs: { places: { amountCents: number }[] }[]) =>
      divs.reduce((sum, d) => sum + d.places.filter((p) => p.amountCents > 0).length, 0);
    return (
      countPlaces(result.divisions) +
      countPlaces(result.femaleIncentiveDivisions) +
      countPlaces(result.militaryIncentiveDivisions)
    );
  }, [result]);

  const plannedPrizeTotals = useMemo(() => {
    if (!form || !prizeSettings) return { costCents: 0, retailValueCents: 0, awardCount: 0 };
    const categoryDivisions = [
      {
        enabled: prizeSettings.main_prizes_enabled,
        category: "main" as const,
        labels: divisionLabelsForCount(form.divisionCount),
      },
      {
        enabled: prizeSettings.female_prizes_enabled,
        category: "female" as const,
        labels: divisionLabelsForCount(form.femaleIncentiveDivisionCount),
      },
      {
        enabled: prizeSettings.military_prizes_enabled,
        category: "military" as const,
        labels: divisionLabelsForCount(form.militaryIncentiveDivisionCount),
      },
    ];
    let costCents = 0;
    let retailValueCents = 0;
    let awardCount = 0;
    for (const group of categoryDivisions) {
      if (!group.enabled) continue;
      for (const division of group.labels) {
        for (let place = 1; place <= SCHEDULE_PLACES_TO_PAY; place++) {
          for (const prize of rulesForPlacement(prizeRules, group.category, division, place)) {
            costCents += prize.cost_cents;
            retailValueCents += prize.retail_value_cents;
            awardCount += 1;
          }
        }
      }
    }
    return { costCents, retailValueCents, awardCount };
  }, [form, prizeRules, prizeSettings]);

  const femaleAwardDivisions = useMemo(() => {
    if (!result || !form) return [];
    if (result.femaleIncentiveDivisions.length > 0) return result.femaleIncentiveDivisions;
    if (!prizeSettings?.female_prizes_enabled || !prizeRules.some((rule) => rule.category === "female")) return [];
    return divisionLabelsForCount(form.femaleIncentiveDivisionCount).map((label, index) => ({
      index,
      label,
      poolCents: 0,
      places: [] as Array<{ place: number; amountCents: number }>,
      placesPaidTotalCents: 0,
    }));
  }, [form, prizeRules, prizeSettings?.female_prizes_enabled, result]);

  const militaryAwardDivisions = useMemo(() => {
    if (!result || !form) return [];
    if (result.militaryIncentiveDivisions.length > 0) return result.militaryIncentiveDivisions;
    if (!prizeSettings?.military_prizes_enabled || !prizeRules.some((rule) => rule.category === "military")) return [];
    return divisionLabelsForCount(form.militaryIncentiveDivisionCount).map((label, index) => ({
      index,
      label,
      poolCents: 0,
      places: [] as Array<{ place: number; amountCents: number }>,
      placesPaidTotalCents: 0,
    }));
  }, [form, prizeRules, prizeSettings?.military_prizes_enabled, result]);

  const autoScheduleColumn = useMemo(
    () => (form ? entryCountToBracket(form.entryCount) : "<10"),
    [form],
  );

  /**
   * Peer Racing algorithm's field-size suggestion (same tables as the division
   * algorithm). Suggestion only — never applied without the producer clicking.
   */
  const algorithmSuggestion = useMemo(() => {
    const count = form?.entryCount ?? 0;
    if (count < 1) return null;
    return {
      divisions: calculateNumDivisions(count),
      paidPlaces: calculateNumPayoutSlots(count),
    };
  }, [form?.entryCount]);

  const femaleAutoScheduleColumn = useMemo(
    () => entryCountToBracket(form?.marketingFemaleEntryCount ?? 0),
    [form?.marketingFemaleEntryCount],
  );
  const militaryAutoScheduleColumn = useMemo(
    () => entryCountToBracket(form?.marketingMilitaryEntryCount ?? 0),
    [form?.marketingMilitaryEntryCount],
  );

  async function save() {
    if (!form || !selectedDistanceId) return;
    if (
      form.cashPayoutsEnabled &&
      form.cashPayoutMode === "guaranteed" &&
      form.femaleIncentiveCents + form.militaryIncentiveCents > form.guaranteedCashPayoutCents
    ) {
      setSaveErr("Female and military incentives cannot exceed the total guaranteed cash payout.");
      return;
    }
    setPending(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch(`/api/promoter/events/${eventId}/payout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distance_id: selectedDistanceId,
          cash_payouts_enabled: form.cashPayoutsEnabled,
          cash_payout_mode: form.cashPayoutMode,
          guaranteed_cash_payout_cents: form.guaranteedCashPayoutCents,
          processing_fee_percent: form.processingFeePercent,
          shootout_percent: form.shootoutPercent,
          pr_holding_percent: form.prHoldingPercent,
          producer_share_of_pr_holding_percent: form.producerShareOfPrPercent,
          true_added_money_cents: form.trueAddedMoneyCents,
          female_incentive_cents: form.femaleIncentiveCents,
          female_incentive_division_count: form.femaleIncentiveDivisionCount,
          female_incentive_places_to_pay: SCHEDULE_PLACES_TO_PAY,
          female_incentive_schedule_mode: form.femaleIncentiveScheduleMode,
          female_incentive_manual_bracket:
            form.femaleIncentiveScheduleMode === "manual" ? form.femaleIncentiveManualBracket : null,
          military_incentive_cents: form.militaryIncentiveCents,
          military_incentive_division_count: form.militaryIncentiveDivisionCount,
          military_incentive_places_to_pay: SCHEDULE_PLACES_TO_PAY,
          military_incentive_schedule_mode: form.militaryIncentiveScheduleMode,
          military_incentive_manual_bracket:
            form.militaryIncentiveScheduleMode === "manual" ? form.militaryIncentiveManualBracket : null,
          elite_division_carve_cents: form.eliteDivisionCarveCents,
          division_count: form.divisionCount,
          elite_division_index: form.eliteDivisionIndex,
          schedule_mode: form.scheduleMode,
          manual_bracket: form.scheduleMode === "manual" ? form.manualBracket : null,
          places_to_pay: SCHEDULE_PLACES_TO_PAY,
          division_labels: divisionLabelsForCount(form.divisionCount),
          marketing_entry_count: form.entryCount,
          marketing_entry_fee_cents: form.entryFeeCents,
          marketing_female_entry_count: form.marketingFemaleEntryCount,
          marketing_military_entry_count: form.marketingMilitaryEntryCount,
          entry_count_override: null,
          entry_fee_cents_override: null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setSaveErr(json.error ?? "Save failed");
        return;
      }
      setSaveMsg("Saved.");
    } catch {
      setSaveErr("Network error");
    } finally {
      setPending(false);
    }
  }

  function setDivisionCount(n: number) {
    const count = Math.max(1, Math.min(MAX_DIVISIONS, Math.floor(n)));
    setForm((f) => {
      if (!f) return f;
      return {
        ...f,
        divisionCount: count,
        eliteDivisionIndex: Math.min(f.eliteDivisionIndex, count - 1),
      };
    });
  }

  if (distances.length === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Add at least one race distance on the event page before using the payout calculator.
      </p>
    );
  }

  if (loading && !form) {
    return <p className="text-sm text-[#1E3A5F]/70">Loading payout settings…</p>;
  }

  if (loadError || !form) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        {loadError ?? "Could not load form."}
        <button
          type="button"
          className="ml-3 font-semibold underline"
          onClick={() => void loadDistance()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800/70">
              Checked-in racers · {selectedLabel}
            </p>
            <p className="font-display mt-1 text-3xl font-bold text-emerald-800">
              {checkedInPaidCount}
              <span className="ml-2 text-base font-semibold text-emerald-800/70">paid racers checked in</span>
            </p>
            <p className="mt-1 text-xs text-emerald-900/70">
              {checkedInCount} total checked in. Final entry-based payouts use only eligible paid check-ins.
            </p>
          </div>
          <div className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">Marketing model racers pot</p>
            <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">
              {result ? fmtUsd(result.racersPotCents) : "—"}
            </p>
            <p className="mt-1 text-xs text-[#1E3A5F]/60">
              From the modeled field of {form.entryCount} below, after processing and PR holding.
            </p>
          </div>
          <div className="rounded-xl border border-[#E87722]/30 bg-[#fff8f3] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#E87722]/80">Checks paid out</p>
            <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">{checksPaidCount}</p>
            <p className="mt-1 text-xs text-[#1E3A5F]/60">
              Every paid place across all divisions and incentive pools.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Race Distance</h2>
          <p className="mt-1 text-xs text-[#1E3A5F]/65">
            Each distance is its own race with separate payouts. Entry fee and entry count below default from this distance.
          </p>
          <label className="mt-4 block text-sm font-medium text-[#1E3A5F]">
            Select distance
            <select
              className={inputClass}
              value={selectedDistanceId}
              onChange={(e) => {
                setSelectedDistanceId(e.target.value);
                const d = distances.find((x) => x.id === e.target.value);
                if (d) setSelectedLabel(d.label);
              }}
            >
              {distances.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-[#1E3A5F]/55">
            Live registration for <span className="font-medium text-[#1E3A5F]">{selectedLabel}</span>:{" "}
            <span className="font-mono">{liveEntryCount}</span> entries · fee{" "}
            <span className="font-mono">{fmtUsd(liveFeeCents)}</span> each
          </p>
        </section>

        <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Marketing Payout Model</h2>
          <p className="mt-1 text-xs text-[#1E3A5F]/65">
            These assumptions create the fixed public estimate. Final entry-based payouts use checked-in, paid racers—not
            this modeled count.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#1E3A5F]">
              Modeled entries
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className={`${inputClass} tabular-nums`}
                value={form.entryCount}
                onChange={(e) => setForm((f) => (f ? { ...f, entryCount: Math.max(0, Number(e.target.value) || 0) } : f))}
              />
            </label>
            <DollarField
              label="Entry fee each"
              hint="Fee assumption shown with the public estimate."
              cents={form.entryFeeCents}
              onChangeCents={(n) => setForm((f) => (f ? { ...f, entryFeeCents: n } : f))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Cash Awards</h2>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-[#1E3A5F]/15 bg-[#fafbfc] p-4">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[#E87722]"
              checked={form.cashPayoutsEnabled}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, cashPayoutsEnabled: e.target.checked } : f))
              }
            />
            <span>
              <span className="block text-sm font-semibold text-[#1E3A5F]">Pay cash awards for this distance</span>
              <span className="mt-1 block text-xs leading-relaxed text-[#1E3A5F]/65">
                Turn this off for a prize-only race. Divisions and placements still publish, but racers receive no wallet
                credit. Net entry revenue follows the PR holding and producer split.
              </span>
            </span>
          </label>
          {form.cashPayoutsEnabled ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-[#1E3A5F]">
                Cash payout type
                <select
                  className={inputClass}
                  value={form.cashPayoutMode}
                  onChange={(e) =>
                    setForm((f) =>
                      f ? { ...f, cashPayoutMode: e.target.value as "entry_based" | "guaranteed" } : f,
                    )
                  }
                >
                  <option value="entry_based">Estimated from modeled entries</option>
                  <option value="guaranteed">Guaranteed fixed cash payout</option>
                </select>
              </label>
              {form.cashPayoutMode === "guaranteed" ? (
                <DollarField
                  label="Guaranteed total cash payout"
                  hint="Complete cash purse. Female and military incentives come off the top; main divisions split the remainder."
                  cents={form.guaranteedCashPayoutCents}
                  onChangeCents={(n) =>
                    setForm((f) => (f ? { ...f, guaranteedCashPayoutCents: n } : f))
                  }
                />
              ) : null}
            </div>
          ) : null}
          {!form.cashPayoutsEnabled ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Prize-only mode is active. Cash incentive amounts, true added money, and the elite cash carve are ignored
              until cash awards are turned back on.
            </p>
          ) : null}
          {form.cashPayoutsEnabled && form.cashPayoutMode === "entry_based" ? (
            <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
              Public copy will label this as an estimate based on {form.entryCount} modeled entries at{" "}
              {fmtUsd(form.entryFeeCents)}. Final cash payouts are determined by final checked-in, paid racers.
            </p>
          ) : null}
          {form.cashPayoutsEnabled && form.cashPayoutMode === "guaranteed" ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
              Public copy will advertise {fmtUsd(form.guaranteedCashPayoutCents)} as the total guaranteed cash payout.
              Incentives use{" "}
              {fmtUsd(form.femaleIncentiveCents + form.militaryIncentiveCents)}, leaving{" "}
              {fmtUsd(
                Math.max(
                  0,
                  form.guaranteedCashPayoutCents -
                    form.femaleIncentiveCents -
                    form.militaryIncentiveCents,
                ),
              )}{" "}
              for main divisions.
            </p>
          ) : null}
        </section>

        <section
          className={`rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm ${
            form.cashPayoutsEnabled ? "" : "opacity-60"
          }`}
        >
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Fees & Splits</h2>
          {form.cashPayoutsEnabled && form.cashPayoutMode === "guaranteed" ? (
            <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
              Guaranteed mode replaces the PR holding percentage: after processing and shootout, the total guaranteed
              purse comes out once. Incentives come off that purse before main divisions split the remainder.
            </p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <PercentField
              label="Processing fee"
              hint="Percent of gross entry pot (e.g. 4 for 4%)."
              value={form.processingFeePercent}
              onChange={(n) => setForm((f) => (f ? { ...f, processingFeePercent: n } : f))}
              step={0.1}
              max={100}
            />
            <PercentField
              label="Shootout fund holding"
              hint="Percent of net-after-processing held back for the series finale — comes out before PR holding."
              value={form.shootoutPercent}
              onChange={(n) => setForm((f) => (f ? { ...f, shootoutPercent: n } : f))}
              step={0.5}
              max={100}
            />
            <PercentField
              label="PR holding"
              hint="Share of net after processing and shootout fund (rest goes to racers pot)."
              value={form.prHoldingPercent}
              onChange={(n) => setForm((f) => (f ? { ...f, prHoldingPercent: n } : f))}
              step={1}
              max={100}
            />
            <PercentField
              label="Producer share of PR holding"
              hint="Rest stays with Peer Racing org."
              value={form.producerShareOfPrPercent}
              onChange={(n) => setForm((f) => (f ? { ...f, producerShareOfPrPercent: n } : f))}
              step={1}
              max={100}
            />
            <DollarField
              label="True added money"
              hint="Sponsor or external dollars into the contestant pool."
              cents={form.trueAddedMoneyCents}
              onChangeCents={(n) => setForm((f) => (f ? { ...f, trueAddedMoneyCents: n } : f))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Payout Schedule</h2>
          <p className="mt-1 text-xs text-[#1E3A5F]/65">
            Choose divisions, which PR payout column applies, optional extra on a division, and female/military incentives.
            True added money is set in Fees &amp; splits above.
          </p>

          <h3 className="mt-6 text-sm font-semibold text-[#1E3A5F]">Peer Teams (Divisions) & Places Paid</h3>
          <p className="mt-1 text-xs text-[#1E3A5F]/65">
            Choose how many Peer Racing divisions (teams) receive payouts. Next, pick the payout schedule column; place
            weights follow that column.
          </p>
          <div className="mt-3 max-w-xs">
            <DivisionCountSelect
              label="Divisions to pay"
              value={form.divisionCount}
              onChange={setDivisionCount}
            />
          </div>

          {algorithmSuggestion ? (
            <div className="mt-4 rounded-lg border border-[#1E3A5F]/15 bg-[#fafbfc] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">
                Peer Racing algorithm suggestion
              </p>
              <p className="mt-1 text-sm text-[#1E3A5F]/80">
                For <span className="font-semibold">{form.entryCount}</span>{" "}
                {form.entryCount === 1 ? "entry" : "entries"}:{" "}
                <span className="font-semibold">{algorithmSuggestion.divisions}</span>{" "}
                {algorithmSuggestion.divisions === 1 ? "division" : "divisions"} ·{" "}
                <span className="font-semibold">{algorithmSuggestion.paidPlaces}</span> paid{" "}
                {algorithmSuggestion.paidPlaces === 1 ? "place" : "places"} per division
              </p>
              {form.divisionCount === algorithmSuggestion.divisions && form.scheduleMode === "auto" ? (
                <p className="mt-1.5 text-xs text-emerald-800">Matches your current settings.</p>
              ) : (
                <button
                  type="button"
                  className="mt-2 rounded-md border border-[#1E3A5F]/25 px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
                  onClick={() => {
                    setDivisionCount(algorithmSuggestion.divisions);
                    setForm((f) => (f ? { ...f, scheduleMode: "auto" } : f));
                  }}
                >
                  Use suggestion
                </button>
              )}
              <p className="mt-1.5 text-xs text-[#1E3A5F]/55">
                Suggestion only — your saved settings always control the race. Paid places follow the auto schedule
                column; switch to manual below to override.
              </p>
            </div>
          ) : null}

          <h3 className="mt-8 text-sm font-semibold text-[#1E3A5F]">Peer Racing Advised Payout Schedules</h3>
          <p className="mt-1 text-xs text-[#1E3A5F]/65">
            The PR payout spreadsheet uses bands like &lt;10, 11–20, 21–40, and so on. Pick how the calculator selects
            which column to use.
          </p>
          <div className="mt-3 space-y-3">
            <label className="block text-sm font-medium text-[#1E3A5F]">
              Schedule
              <select
                className={inputClass}
                value={form.scheduleMode}
                onChange={(e) => setForm((f) => (f ? { ...f, scheduleMode: e.target.value as "auto" | "manual" } : f))}
              >
                <option value="auto">
                  Auto: use PR column from entry count (&lt;10, 11–20, 21–40, …)
                </option>
                <option value="manual">Manually Choose Payouts</option>
              </select>
            </label>
            {form.scheduleMode === "auto" ? (
              <p className="text-xs leading-relaxed text-[#1E3A5F]/70">
                Uses the modeled entry count for this distance ({form.entryCount} {form.entryCount === 1 ? "entry" : "entries"}
                ). That maps to the <span className="font-semibold text-[#1E3A5F]">{autoScheduleColumn}</span> column—the
                same banding as the Peer Racing payout spreadsheet (e.g. fewer than 10 → &lt;10; 11–20 → 11 to 20).
              </p>
            ) : (
              <label className="block text-sm font-medium text-[#1E3A5F]">
                Schedule column (entrant band)
                <select
                  className={inputClass}
                  value={form.manualBracket}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, manualBracket: e.target.value as PayoutBracketId } : f))
                  }
                >
                  {PAYOUT_BRACKET_ORDER.map((b) => (
                    <option key={b} value={b}>
                      {bracketOptionLabel(b)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="mt-8 rounded-r-lg border border-[#E87722]/25 border-l-4 border-l-[#E87722] bg-[#fff9f5] px-4 py-4 sm:px-5">
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
              <label className="block text-sm font-medium text-[#1E3A5F]">
                Choose division
                <select
                  className={inputClass}
                  value={form.eliteDivisionIndex}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, eliteDivisionIndex: Number(e.target.value) } : f))
                  }
                >
                  {divisionLabelsForCount(form.divisionCount).map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <DollarField
                label="Add Money to Chosen Division (from racers pot)"
                cents={form.eliteDivisionCarveCents}
                onChangeCents={(n) => setForm((f) => (f ? { ...f, eliteDivisionCarveCents: n } : f))}
              />
            </div>
          </div>

          <h3 className="mt-8 text-sm font-semibold text-[#1E3A5F]">Incentive Payoffs</h3>
          <p className="mt-1 text-xs text-[#1E3A5F]/65">
            Splits only apply to dollars in each incentive pool. Each pool can use its own PR payout schedule column
            (auto from female or military entry counts for this distance, or manual). Place weights follow that column.
          </p>
          <div className="mt-3 space-y-2 rounded-lg border border-[#1E3A5F]/15 bg-[#fafbfc] px-4 py-3 text-sm text-[#1E3A5F]">
            <p>
              <span className="font-medium">Entries (this distance, all registered):</span>{" "}
              <span className="text-[#1E3A5F]/80">
                {femaleEntryCount} female · {militaryEntryCount} military
              </span>
            </p>
            <p>
              <span className="font-medium">Checked in (kiosk):</span>{" "}
              <span className="text-[#1E3A5F]/80">
                {checkedInFemaleCount} female · {checkedInMilitaryCount} military
              </span>
            </p>
          </div>

          <div className="mt-6 space-y-8">
            <div>
              <p className="text-sm font-semibold text-[#1E3A5F]">Female Incentive Pool</p>
              <div className="mt-3 max-w-md">
                <DollarField
                  label="Female incentive (from racers pot)"
                  hint="Set aside before main division pools; split below only applies to this amount."
                  cents={form.femaleIncentiveCents}
                  onChangeCents={(n) => setForm((f) => (f ? { ...f, femaleIncentiveCents: n } : f))}
                />
              </div>
              {form.femaleIncentiveCents > 0 ? (
                <div className="mt-4 space-y-4">
                  <div className="max-w-xl space-y-3">
                    <label className="block text-sm font-medium text-[#1E3A5F]">
                      Female pool — payout schedule
                      <select
                        className={inputClass}
                        value={form.femaleIncentiveScheduleMode}
                        onChange={(e) =>
                          setForm((f) =>
                            f
                              ? {
                                  ...f,
                                  femaleIncentiveScheduleMode: e.target.value as "auto" | "manual",
                                }
                              : f,
                          )
                        }
                      >
                        <option value="auto">
                          Auto: PR column from modeled female count ({form.marketingFemaleEntryCount}{" "}
                          {form.marketingFemaleEntryCount === 1 ? "entry" : "entries"} → {femaleAutoScheduleColumn})
                        </option>
                        <option value="manual">Manually choose schedule column</option>
                      </select>
                    </label>
                    {form.femaleIncentiveScheduleMode === "manual" ? (
                      <label className="block text-sm font-medium text-[#1E3A5F]">
                        Schedule column (female pool)
                        <select
                          className={inputClass}
                          value={form.femaleIncentiveManualBracket}
                          onChange={(e) =>
                            setForm((f) =>
                              f
                                ? {
                                    ...f,
                                    femaleIncentiveManualBracket: e.target.value as PayoutBracketId,
                                  }
                                : f,
                            )
                          }
                        >
                          {PAYOUT_BRACKET_ORDER.map((b) => (
                            <option key={b} value={b}>
                              {bracketOptionLabel(b)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <p className="text-xs leading-relaxed text-[#1E3A5F]/70">
                        Auto mode uses the saved marketing snapshot of {form.marketingFemaleEntryCount} female entries to
                        keep the advertised example fixed.
                      </p>
                    )}
                  </div>
                  <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                    <DivisionCountSelect
                      label="Divisions (female pool)"
                      value={form.femaleIncentiveDivisionCount}
                      onChange={(n) =>
                        setForm((f) => (f ? { ...f, femaleIncentiveDivisionCount: n } : f))
                      }
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#1E3A5F]/55">
                  Enter an amount above to choose divisions for the female incentive pool. Holes paid come from the
                  schedule column.
                </p>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-[#1E3A5F]">Military Incentive Pool</p>
              <div className="mt-3 max-w-md">
                <DollarField
                  label="Military incentive (from racers pot)"
                  hint="Set aside before main division pools; split below only applies to this amount."
                  cents={form.militaryIncentiveCents}
                  onChangeCents={(n) => setForm((f) => (f ? { ...f, militaryIncentiveCents: n } : f))}
                />
              </div>
              {form.militaryIncentiveCents > 0 ? (
                <div className="mt-4 space-y-4">
                  <div className="max-w-xl space-y-3">
                    <label className="block text-sm font-medium text-[#1E3A5F]">
                      Military pool — payout schedule
                      <select
                        className={inputClass}
                        value={form.militaryIncentiveScheduleMode}
                        onChange={(e) =>
                          setForm((f) =>
                            f
                              ? {
                                  ...f,
                                  militaryIncentiveScheduleMode: e.target.value as "auto" | "manual",
                                }
                              : f,
                          )
                        }
                      >
                        <option value="auto">
                          Auto: PR column from modeled military count ({form.marketingMilitaryEntryCount}{" "}
                          {form.marketingMilitaryEntryCount === 1 ? "entry" : "entries"} → {militaryAutoScheduleColumn})
                        </option>
                        <option value="manual">Manually choose schedule column</option>
                      </select>
                    </label>
                    {form.militaryIncentiveScheduleMode === "manual" ? (
                      <label className="block text-sm font-medium text-[#1E3A5F]">
                        Schedule column (military pool)
                        <select
                          className={inputClass}
                          value={form.militaryIncentiveManualBracket}
                          onChange={(e) =>
                            setForm((f) =>
                              f
                                ? {
                                    ...f,
                                    militaryIncentiveManualBracket: e.target.value as PayoutBracketId,
                                  }
                                : f,
                            )
                          }
                        >
                          {PAYOUT_BRACKET_ORDER.map((b) => (
                            <option key={b} value={b}>
                              {bracketOptionLabel(b)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <p className="text-xs leading-relaxed text-[#1E3A5F]/70">
                        Auto mode uses the saved marketing snapshot of {form.marketingMilitaryEntryCount} military entries
                        to keep the advertised example fixed.
                      </p>
                    )}
                  </div>
                  <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                    <DivisionCountSelect
                      label="Divisions (military pool)"
                      value={form.militaryIncentiveDivisionCount}
                      onChange={(n) =>
                        setForm((f) => (f ? { ...f, militaryIncentiveDivisionCount: n } : f))
                      }
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#1E3A5F]/55">
                  Enter an amount above to choose divisions for the military incentive pool. Holes paid come from the
                  schedule column.
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || loading}
            onClick={() => void save()}
            className="rounded-lg bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save settings for this distance"}
          </button>
          {saveMsg ? <span className="text-sm text-emerald-800">{saveMsg}</span> : null}
          {saveErr ? <span className="text-sm text-red-700">{saveErr}</span> : null}
        </div>
      </div>

      <div className="space-y-4">
        {result ? (
          <>
            <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#1E3A5F]/55">Live calculation</p>
              <p className="mt-1 text-sm text-[#1E3A5F]/75">
                Bracket used: <span className="font-semibold text-[#1E3A5F]">{bracketOptionLabel(result.bracketUsed)}</span>
              </p>
              <dl className="mt-4 space-y-2 text-sm text-[#1E3A5F]">
                <div className="flex justify-between gap-4">
                  <dt>Gross pot</dt>
                  <dd>{fmtUsd(result.grossPotCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Processing</dt>
                  <dd>{fmtUsd(result.processingFeeCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Net after processing</dt>
                  <dd>{fmtUsd(result.netAfterProcessingCents)}</dd>
                </div>
                {result.shootoutFundCents > 0 ? (
                  <div className="flex justify-between gap-4">
                    <dt>Shootout fund holding</dt>
                    <dd className="text-right tabular-nums font-semibold text-[#E87722]">
                      {fmtUsd(result.shootoutFundCents)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt>PR holding</dt>
                  <dd>{fmtUsd(result.prHoldingCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Racers pot</dt>
                  <dd className="text-right tabular-nums">{fmtUsd(result.racersPotCents)}</dd>
                </div>
                {result.cashPayoutMode === "guaranteed" ? (
                  <>
                    <div className="flex justify-between gap-4 font-semibold">
                      <dt>Guaranteed total cash payout</dt>
                      <dd>{fmtUsd(result.guaranteedCashPayoutCents)}</dd>
                    </div>
                    {result.companyFundedCashShortfallCents > 0 ? (
                      <div className="flex justify-between gap-4 text-red-700">
                        <dt>Company-funded cash shortfall</dt>
                        <dd className="font-semibold">{fmtUsd(result.companyFundedCashShortfallCents)}</dd>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {plannedPrizeTotals.awardCount > 0 ? (
                  <>
                    <div className="flex justify-between gap-4 border-t border-[#E87722]/20 pt-2 font-semibold text-[#E87722]">
                      <dt>Planned physical-prize cost</dt>
                      <dd>{fmtUsd(plannedPrizeTotals.costCents)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 text-[#E87722]">
                      <dt>Advertised prize retail value</dt>
                      <dd>{fmtUsd(plannedPrizeTotals.retailValueCents)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-[#E87722]/20 pb-2 font-semibold text-[#1E3A5F]">
                      <dt>Total company award commitment</dt>
                      <dd>
                        {fmtUsd(
                          result.totalContestantPayoutsCents +
                            result.femaleIncentiveCents +
                            result.militaryIncentiveCents +
                            plannedPrizeTotals.costCents,
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 text-xs text-[#1E3A5F]/60">
                      <dt>Physical awards planned</dt>
                      <dd>{plannedPrizeTotals.awardCount}</dd>
                    </div>
                  </>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt>Less female incentive (planned)</dt>
                  <LedgerDd cents={-result.femaleIncentiveRequestedCents} />
                </div>
                {result.femaleIncentiveRequestedCents > 0 && result.femaleIncentiveBracketUsed ? (
                  <div className="flex justify-between gap-4">
                    <dt>Female pool — schedule column</dt>
                    <dd className="text-right font-semibold">{bracketOptionLabel(result.femaleIncentiveBracketUsed)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt>Less military incentive (planned)</dt>
                  <LedgerDd cents={-result.militaryIncentiveRequestedCents} />
                </div>
                {result.militaryIncentiveRequestedCents > 0 && result.militaryIncentiveBracketUsed ? (
                  <div className="flex justify-between gap-4">
                    <dt>Military pool — schedule column</dt>
                    <dd className="text-right font-semibold">{bracketOptionLabel(result.militaryIncentiveBracketUsed)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt>Plus true added money</dt>
                  <LedgerDd cents={result.trueAddedMoneyCents} />
                </div>
                <div className="flex justify-between gap-4 border-t border-[#1E3A5F]/10 pt-2">
                  <dt className="font-medium">Contestant pool (ledger)</dt>
                  <LedgerDd cents={result.contestantPoolLedgerCents} />
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Less elite carve (planned)</dt>
                  <LedgerDd cents={-result.eliteCarveRequestedCents} />
                </div>
                <div className="flex justify-between gap-4 border-b border-[#1E3A5F]/10 pb-2">
                  <dt className="font-medium">Remainder after carve (ledger)</dt>
                  <LedgerDd cents={result.poolAfterCarveLedgerCents} />
                </div>
                <div className="flex justify-between gap-4 pt-2">
                  <dt>Producer (from PR holding)</dt>
                  <dd className="text-right tabular-nums">{fmtUsd(result.producerCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Peer Racing org (from PR holding)</dt>
                  <dd className="text-right tabular-nums">{fmtUsd(result.peerRacingOrgCents)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-[#1E3A5F]/60">
                Negative ledger lines mean planned payouts exceed current entry fees; division and incentive tables below
                still use every dollar that actually exists in the pot (funded amounts).
              </p>
              {result.warnings.length > 0 ? (
                <ul className="mt-4 list-inside list-disc text-xs text-amber-900">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            {result.divisions.map((d) => (
              <div key={d.index} className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm">
                <p className="font-display text-base font-semibold text-[#1E3A5F]">{d.label}</p>
                <p className="mt-1 text-xs text-[#1E3A5F]/60">
                  Division pool {fmtUsd(d.poolCents)} · Paid out {fmtUsd(d.placesPaidTotalCents)}
                  {prizeSettings?.main_prizes_enabled &&
                  maxPrizePlace(prizeRules, "main", d.label) > 0
                    ? ` · Prizes through ${maxPrizePlace(prizeRules, "main", d.label)} place`
                    : ""}
                </p>
                <DivisionAwardLines
                  category="main"
                  division={d.label}
                  cashPlaces={d.places}
                  prizeRules={prizeRules}
                  prizesEnabled={prizeSettings?.main_prizes_enabled === true}
                />
              </div>
            ))}

            {femaleAwardDivisions.length > 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">
                  Female incentive (by division)
                </p>
                {femaleAwardDivisions.map((d) => (
                  <div
                    key={`f-${d.index}`}
                    className="rounded-xl border border-pink-200/80 bg-white p-5 shadow-sm"
                  >
                    <p className="font-display text-base font-semibold text-[#1E3A5F]">{d.label}</p>
                    <p className="mt-1 text-xs text-[#1E3A5F]/60">
                      Pool {fmtUsd(d.poolCents)} · Paid out {fmtUsd(d.placesPaidTotalCents)}
                    </p>
                    <DivisionAwardLines
                      category="female"
                      division={d.label}
                      cashPlaces={d.places}
                      prizeRules={prizeRules}
                      prizesEnabled={prizeSettings?.female_prizes_enabled === true}
                    />
                  </div>
                ))}
              </>
            ) : null}

            {militaryAwardDivisions.length > 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">
                  Military incentive (by division)
                </p>
                {militaryAwardDivisions.map((d) => (
                  <div
                    key={`m-${d.index}`}
                    className="rounded-xl border border-slate-300/90 bg-white p-5 shadow-sm"
                  >
                    <p className="font-display text-base font-semibold text-[#1E3A5F]">{d.label}</p>
                    <p className="mt-1 text-xs text-[#1E3A5F]/60">
                      Pool {fmtUsd(d.poolCents)} · Paid out {fmtUsd(d.placesPaidTotalCents)}
                    </p>
                    <DivisionAwardLines
                      category="military"
                      division={d.label}
                      cashPlaces={d.places}
                      prizeRules={prizeRules}
                      prizesEnabled={prizeSettings?.military_prizes_enabled === true}
                    />
                  </div>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </div>
      </div>
    </div>
  );
}
