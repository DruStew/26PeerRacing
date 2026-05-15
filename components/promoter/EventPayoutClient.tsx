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
} from "@/lib/payout";
import type { DistancePayoutSettingsRow, PayoutBracketId, PayoutCalculationInput } from "@/lib/payout/types";

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

/** Divisions are always named in this order; only the count (1–5) varies. */
const DIVISION_NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"] as const;
const MAX_DIVISIONS = DIVISION_NAMES.length;

/** Full PR schedule columns use up to 12 place rows; weights are zero where the sheet leaves a hole empty. */
const SCHEDULE_PLACES_TO_PAY = 12;

function divisionLabelsForCount(count: number): string[] {
  const c = Math.max(1, Math.min(MAX_DIVISIONS, Math.floor(count)));
  return [...DIVISION_NAMES.slice(0, c)];
}

type DistanceOption = { id: string; label: string; entry_fee_cents: number };

type FormState = {
  entryCount: number;
  entryFeeCents: number;
  processingFeePercent: number;
  prHoldingPercent: number;
  producerShareOfPrPercent: number;
  trueAddedMoneyCents: number;
  femaleIncentiveCents: number;
  femaleIncentiveDivisionCount: number;
  femaleIncentivePlacesToPay: number;
  femaleIncentiveScheduleMode: "auto" | "manual";
  femaleIncentiveManualBracket: PayoutBracketId;
  militaryIncentiveCents: number;
  militaryIncentiveDivisionCount: number;
  militaryIncentivePlacesToPay: number;
  militaryIncentiveScheduleMode: "auto" | "manual";
  militaryIncentiveManualBracket: PayoutBracketId;
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
): FormState {
  const d = defaultDistancePayoutSettings("00000000-0000-0000-0000-000000000000");
  const r = row
    ? (() => {
        const divisionCount = Math.min(MAX_DIVISIONS, Math.max(1, row.division_count));
        const eliteDivisionIndex = Math.min(divisionCount - 1, Math.max(0, row.elite_division_index));
        return {
          entryCount: row.entry_count_override ?? liveEntryCount,
          entryFeeCents: row.entry_fee_cents_override ?? liveFeeCents,
          processingFeePercent: Number(row.processing_fee_fraction) * 100,
          prHoldingPercent: Number(row.pr_holding_fraction) * 100,
          producerShareOfPrPercent: Number(row.producer_fraction_of_pr_holding) * 100,
          trueAddedMoneyCents: row.true_added_money_cents,
          femaleIncentiveCents: row.female_incentive_cents ?? 0,
          femaleIncentiveDivisionCount: Math.min(
            MAX_DIVISIONS,
            Math.max(1, Math.floor(Number(row.female_incentive_division_count ?? 1))),
          ),
          femaleIncentivePlacesToPay: Math.min(
            12,
            Math.max(1, Math.floor(Number(row.female_incentive_places_to_pay ?? 12))),
          ),
          femaleIncentiveScheduleMode: row.female_incentive_schedule_mode ?? "auto",
          femaleIncentiveManualBracket: (row.female_incentive_manual_bracket as PayoutBracketId) ?? "91-120",
          militaryIncentiveCents: row.military_incentive_cents ?? 0,
          militaryIncentiveDivisionCount: Math.min(
            MAX_DIVISIONS,
            Math.max(1, Math.floor(Number(row.military_incentive_division_count ?? 1))),
          ),
          militaryIncentivePlacesToPay: Math.min(
            12,
            Math.max(1, Math.floor(Number(row.military_incentive_places_to_pay ?? 12))),
          ),
          militaryIncentiveScheduleMode: row.military_incentive_schedule_mode ?? "auto",
          militaryIncentiveManualBracket: (row.military_incentive_manual_bracket as PayoutBracketId) ?? "91-120",
          eliteDivisionCarveCents: row.elite_division_carve_cents,
          divisionCount,
          eliteDivisionIndex,
          scheduleMode: row.schedule_mode,
          manualBracket: (row.manual_bracket as PayoutBracketId) ?? "91-120",
        };
      })()
    : {
        entryCount: liveEntryCount,
        entryFeeCents: liveFeeCents,
        processingFeePercent: d.processing_fee_fraction * 100,
        prHoldingPercent: d.pr_holding_fraction * 100,
        producerShareOfPrPercent: d.producer_fraction_of_pr_holding * 100,
        trueAddedMoneyCents: 0,
        femaleIncentiveCents: 0,
        femaleIncentiveDivisionCount: 1,
        femaleIncentivePlacesToPay: 12,
        femaleIncentiveScheduleMode: "auto" as const,
        femaleIncentiveManualBracket: "91-120",
        militaryIncentiveCents: 0,
        militaryIncentiveDivisionCount: 1,
        militaryIncentivePlacesToPay: 12,
        militaryIncentiveScheduleMode: "auto" as const,
        militaryIncentiveManualBracket: "91-120",
        eliteDivisionCarveCents: 0,
        divisionCount: 5,
        eliteDivisionIndex: 0,
        scheduleMode: "auto" as const,
        manualBracket: "91-120",
      };
  return r as FormState;
}

function formToInput(
  f: FormState,
  incentiveBandCounts: { femaleEntryCount: number; militaryEntryCount: number },
): PayoutCalculationInput {
  return {
    entryCount: f.entryCount,
    entryFeeCents: f.entryFeeCents,
    processingFeeFraction: f.processingFeePercent / 100,
    prHoldingFraction: f.prHoldingPercent / 100,
    producerFractionOfPrHolding: f.producerShareOfPrPercent / 100,
    trueAddedMoneyCents: f.trueAddedMoneyCents,
    femaleIncentiveFromRacersPotCents: f.femaleIncentiveCents,
    femaleIncentiveDivisionCount: f.femaleIncentiveDivisionCount,
    femaleIncentivePlacesToPay: f.femaleIncentivePlacesToPay,
    femaleIncentiveDivisionLabels: divisionLabelsForCount(f.femaleIncentiveDivisionCount),
    femaleIncentiveScheduleMode: f.femaleIncentiveScheduleMode,
    femaleIncentiveManualBracket:
      f.femaleIncentiveScheduleMode === "manual" ? f.femaleIncentiveManualBracket : undefined,
    femaleIncentiveBracketEntryCount: Math.max(0, incentiveBandCounts.femaleEntryCount),
    militaryIncentiveFromRacersPotCents: f.militaryIncentiveCents,
    militaryIncentiveDivisionCount: f.militaryIncentiveDivisionCount,
    militaryIncentivePlacesToPay: f.militaryIncentivePlacesToPay,
    militaryIncentiveDivisionLabels: divisionLabelsForCount(f.militaryIncentiveDivisionCount),
    militaryIncentiveScheduleMode: f.militaryIncentiveScheduleMode,
    militaryIncentiveManualBracket:
      f.militaryIncentiveScheduleMode === "manual" ? f.militaryIncentiveManualBracket : undefined,
    militaryIncentiveBracketEntryCount: Math.max(0, incentiveBandCounts.militaryEntryCount),
    eliteDivisionCarveFromPoolCents: f.eliteDivisionCarveCents,
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
  const [checkedInFemaleCount, setCheckedInFemaleCount] = useState(0);
  const [checkedInMilitaryCount, setCheckedInMilitaryCount] = useState(0);
  const [femaleEntryCount, setFemaleEntryCount] = useState(0);
  const [militaryEntryCount, setMilitaryEntryCount] = useState(0);

  const loadDistance = useCallback(async () => {
    if (!selectedDistanceId) {
      setForm(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/promoter/events/${eventId}/payout?distanceId=${encodeURIComponent(selectedDistanceId)}`);
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        settings?: DistancePayoutSettingsRow | null;
        suggestedEntryCount?: number;
        suggestedFeeCents?: number;
        distance?: { label: string };
        checkedInFemaleCount?: number;
        checkedInMilitaryCount?: number;
        femaleEntryCount?: number;
        militaryEntryCount?: number;
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
      setCheckedInFemaleCount(json.checkedInFemaleCount ?? 0);
      setCheckedInMilitaryCount(json.checkedInMilitaryCount ?? 0);
      if (json.distance?.label) setSelectedLabel(json.distance.label);
      setForm(rowToForm(json.settings ?? null, liveC, liveF));
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

  const result = useMemo(
    () =>
      form
        ? calculateEventPayout(
            formToInput(form, { femaleEntryCount, militaryEntryCount }),
          )
        : null,
    [form, femaleEntryCount, militaryEntryCount],
  );

  const autoScheduleColumn = useMemo(
    () => (form ? entryCountToBracket(form.entryCount) : "<10"),
    [form?.entryCount],
  );

  const femaleAutoScheduleColumn = useMemo(
    () => entryCountToBracket(femaleEntryCount),
    [femaleEntryCount],
  );
  const militaryAutoScheduleColumn = useMemo(
    () => entryCountToBracket(militaryEntryCount),
    [militaryEntryCount],
  );

  async function save() {
    if (!form || !selectedDistanceId) return;
    setPending(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      const entry_count_override = form.entryCount === liveEntryCount ? null : form.entryCount;
      const entry_fee_cents_override = form.entryFeeCents === liveFeeCents ? null : form.entryFeeCents;

      const res = await fetch(`/api/promoter/events/${eventId}/payout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distance_id: selectedDistanceId,
          processing_fee_percent: form.processingFeePercent,
          pr_holding_percent: form.prHoldingPercent,
          producer_share_of_pr_holding_percent: form.producerShareOfPrPercent,
          true_added_money_cents: form.trueAddedMoneyCents,
          female_incentive_cents: form.femaleIncentiveCents,
          female_incentive_division_count: form.femaleIncentiveDivisionCount,
          female_incentive_places_to_pay: form.femaleIncentivePlacesToPay,
          female_incentive_schedule_mode: form.femaleIncentiveScheduleMode,
          female_incentive_manual_bracket:
            form.femaleIncentiveScheduleMode === "manual" ? form.femaleIncentiveManualBracket : null,
          military_incentive_cents: form.militaryIncentiveCents,
          military_incentive_division_count: form.militaryIncentiveDivisionCount,
          military_incentive_places_to_pay: form.militaryIncentivePlacesToPay,
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
          entry_count_override,
          entry_fee_cents_override,
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
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Race distance</h2>
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
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Entries & entry fee (this distance)</h2>
          <p className="mt-1 text-xs text-[#1E3A5F]/65">
            Adjust only if you are modeling a different number than live registration. Matching live clears saved overrides.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#1E3A5F]">
              Entry count
              <input
                type="number"
                min={0}
                className={`${inputClass} tabular-nums`}
                value={form.entryCount}
                onChange={(e) => setForm((f) => (f ? { ...f, entryCount: Math.max(0, Number(e.target.value) || 0) } : f))}
              />
            </label>
            <DollarField
              label="Entry fee each"
              hint="Defaults from distance; change to override for modeling."
              cents={form.entryFeeCents}
              onChangeCents={(n) => setForm((f) => (f ? { ...f, entryFeeCents: n } : f))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Fees & splits</h2>
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
              label="PR holding"
              hint="Share of net-after-processing (rest goes to racers pot)."
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
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Payout schedule</h2>
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
            <label className="block text-sm font-medium text-[#1E3A5F]">
              Divisions to pay
              <input
                type="number"
                min={1}
                max={MAX_DIVISIONS}
                className={`${inputClass} tabular-nums`}
                value={form.divisionCount}
                onChange={(e) => setDivisionCount(Number(e.target.value))}
              />
            </label>
          </div>

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
                      {b}
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

          <h3 className="mt-8 text-sm font-semibold text-[#1E3A5F]">Incentive payoffs</h3>
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
              <p className="text-sm font-semibold text-[#1E3A5F]">Female incentive pool</p>
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
                          Auto: PR column from female entry count ({femaleEntryCount}{" "}
                          {femaleEntryCount === 1 ? "entry" : "entries"} → {femaleAutoScheduleColumn})
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
                              {b}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <p className="text-xs leading-relaxed text-[#1E3A5F]/70">
                        Auto mode uses registered female entries for this distance ({femaleEntryCount}) to pick the Peer
                        Racing column (same banding as the main calculator).
                      </p>
                    )}
                  </div>
                  <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-[#1E3A5F]">
                    Divisions (female pool)
                    <input
                      type="number"
                      min={1}
                      max={MAX_DIVISIONS}
                      className={`${inputClass} tabular-nums`}
                      value={form.femaleIncentiveDivisionCount}
                      onChange={(e) =>
                        setForm((f) =>
                          f
                            ? {
                                ...f,
                                femaleIncentiveDivisionCount: Math.min(
                                  MAX_DIVISIONS,
                                  Math.max(1, Number(e.target.value) || 1),
                                ),
                              }
                            : f,
                        )
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium text-[#1E3A5F]">
                    Holes to pay (female pool)
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className={`${inputClass} tabular-nums`}
                      value={form.femaleIncentivePlacesToPay}
                      onChange={(e) =>
                        setForm((f) =>
                          f
                            ? {
                                ...f,
                                femaleIncentivePlacesToPay: Math.min(
                                  12,
                                  Math.max(1, Number(e.target.value) || 1),
                                ),
                              }
                            : f,
                        )
                      }
                    />
                  </label>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#1E3A5F]/55">
                  Enter an amount above to choose divisions and holes for the female incentive pool.
                </p>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-[#1E3A5F]">Military incentive pool</p>
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
                          Auto: PR column from military entry count ({militaryEntryCount}{" "}
                          {militaryEntryCount === 1 ? "entry" : "entries"} → {militaryAutoScheduleColumn})
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
                              {b}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <p className="text-xs leading-relaxed text-[#1E3A5F]/70">
                        Auto mode uses registered military entries for this distance ({militaryEntryCount}) to pick the Peer
                        Racing column (same banding as the main calculator).
                      </p>
                    )}
                  </div>
                  <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-[#1E3A5F]">
                    Divisions (military pool)
                    <input
                      type="number"
                      min={1}
                      max={MAX_DIVISIONS}
                      className={`${inputClass} tabular-nums`}
                      value={form.militaryIncentiveDivisionCount}
                      onChange={(e) =>
                        setForm((f) =>
                          f
                            ? {
                                ...f,
                                militaryIncentiveDivisionCount: Math.min(
                                  MAX_DIVISIONS,
                                  Math.max(1, Number(e.target.value) || 1),
                                ),
                              }
                            : f,
                        )
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium text-[#1E3A5F]">
                    Holes to pay (military pool)
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className={`${inputClass} tabular-nums`}
                      value={form.militaryIncentivePlacesToPay}
                      onChange={(e) =>
                        setForm((f) =>
                          f
                            ? {
                                ...f,
                                militaryIncentivePlacesToPay: Math.min(
                                  12,
                                  Math.max(1, Number(e.target.value) || 1),
                                ),
                              }
                            : f,
                        )
                      }
                    />
                  </label>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#1E3A5F]/55">
                  Enter an amount above to choose divisions and holes for the military incentive pool.
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
                Bracket used: <span className="font-semibold text-[#1E3A5F]">{result.bracketUsed}</span>
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
                <div className="flex justify-between gap-4">
                  <dt>PR holding</dt>
                  <dd>{fmtUsd(result.prHoldingCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Racers pot</dt>
                  <dd className="text-right tabular-nums">{fmtUsd(result.racersPotCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Less female incentive (planned)</dt>
                  <LedgerDd cents={-result.femaleIncentiveRequestedCents} />
                </div>
                {result.femaleIncentiveRequestedCents > 0 && result.femaleIncentiveBracketUsed ? (
                  <div className="flex justify-between gap-4">
                    <dt>Female pool — schedule column</dt>
                    <dd className="text-right font-semibold">{result.femaleIncentiveBracketUsed}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt>Less military incentive (planned)</dt>
                  <LedgerDd cents={-result.militaryIncentiveRequestedCents} />
                </div>
                {result.militaryIncentiveRequestedCents > 0 && result.militaryIncentiveBracketUsed ? (
                  <div className="flex justify-between gap-4">
                    <dt>Military pool — schedule column</dt>
                    <dd className="text-right font-semibold">{result.militaryIncentiveBracketUsed}</dd>
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
                </p>
                <ul className="mt-3 divide-y divide-[#1E3A5F]/10 text-sm">
                  {d.places
                    .filter((p) => p.amountCents > 0)
                    .map((p) => (
                      <li key={p.place} className="flex justify-between gap-2 py-1.5">
                        <span className="text-[#1E3A5F]/80">{p.place} place</span>
                        <span className="font-medium text-[#1E3A5F]">{fmtUsd(p.amountCents)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}

            {result.femaleIncentiveDivisions.length > 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">
                  Female incentive (by division)
                </p>
                {result.femaleIncentiveDivisions.map((d) => (
                  <div
                    key={`f-${d.index}`}
                    className="rounded-xl border border-pink-200/80 bg-white p-5 shadow-sm"
                  >
                    <p className="font-display text-base font-semibold text-[#1E3A5F]">{d.label}</p>
                    <p className="mt-1 text-xs text-[#1E3A5F]/60">
                      Pool {fmtUsd(d.poolCents)} · Paid out {fmtUsd(d.placesPaidTotalCents)}
                    </p>
                    <ul className="mt-3 divide-y divide-[#1E3A5F]/10 text-sm">
                      {d.places
                        .filter((p) => p.amountCents > 0)
                        .map((p) => (
                          <li key={p.place} className="flex justify-between gap-2 py-1.5">
                            <span className="text-[#1E3A5F]/80">{p.place} place</span>
                            <span className="font-medium text-[#1E3A5F]">{fmtUsd(p.amountCents)}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </>
            ) : null}

            {result.militaryIncentiveDivisions.length > 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">
                  Military incentive (by division)
                </p>
                {result.militaryIncentiveDivisions.map((d) => (
                  <div
                    key={`m-${d.index}`}
                    className="rounded-xl border border-slate-300/90 bg-white p-5 shadow-sm"
                  >
                    <p className="font-display text-base font-semibold text-[#1E3A5F]">{d.label}</p>
                    <p className="mt-1 text-xs text-[#1E3A5F]/60">
                      Pool {fmtUsd(d.poolCents)} · Paid out {fmtUsd(d.placesPaidTotalCents)}
                    </p>
                    <ul className="mt-3 divide-y divide-[#1E3A5F]/10 text-sm">
                      {d.places
                        .filter((p) => p.amountCents > 0)
                        .map((p) => (
                          <li key={p.place} className="flex justify-between gap-2 py-1.5">
                            <span className="text-[#1E3A5F]/80">{p.place} place</span>
                            <span className="font-medium text-[#1E3A5F]">{fmtUsd(p.amountCents)}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
