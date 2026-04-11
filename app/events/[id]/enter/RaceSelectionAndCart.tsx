"use client";

import { useCallback, useEffect, useState } from "react";

type DistanceItem = { id: string; label: string; entry_fee_cents: number };
type CartLine = { label: string; feeCents: number };

export function RaceSelectionAndCart({
  formId,
  distances,
  qualifierId,
  qualifierLabel,
  rollOverTargets,
  gunTimes,
}: {
  formId: string;
  distances: DistanceItem[];
  qualifierId: string | null;
  qualifierLabel: string;
  rollOverTargets: DistanceItem[];
  gunTimes: Record<string, string>;
}) {
  const [lineItems, setLineItems] = useState<CartLine[]>([]);
  const [totalCents, setTotalCents] = useState(0);

  const syncRollOverPrimaryExclusion = useCallback(() => {
    if (!qualifierId || rollOverTargets.length === 0) return;
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const qualPrimary = form.querySelector<HTMLInputElement>(
      `input[name="enter_distance"][value="${qualifierId}"]`,
    );
    if (!qualPrimary?.checked) {
      rollOverTargets.forEach((t) => {
        const rollName = `roll_over_${t.id}_from_${qualifierId}`;
        const rollEl = form.querySelector<HTMLInputElement>(`input[name="${rollName}"]`);
        const primaryEl = form.querySelector<HTMLInputElement>(
          `input[name="enter_distance"][value="${t.id}"]`,
        );
        if (rollEl) {
          rollEl.checked = false;
          rollEl.disabled = true;
          rollEl.title = "Select the Peer Racing Qualifier as a primary entry to use roll-over.";
        }
        if (primaryEl) {
          primaryEl.disabled = false;
          primaryEl.title = "";
        }
      });
      return;
    }

    rollOverTargets.forEach((t) => {
      const rollName = `roll_over_${t.id}_from_${qualifierId}`;
      const rollEl = form.querySelector<HTMLInputElement>(`input[name="${rollName}"]`);
      const primaryEl = form.querySelector<HTMLInputElement>(
        `input[name="enter_distance"][value="${t.id}"]`,
      );
      if (!rollEl || !primaryEl) return;
      rollEl.disabled = false;
      if (rollEl.checked) {
        primaryEl.checked = false;
        primaryEl.disabled = true;
        primaryEl.title =
          "Roll-over from the qualifier is selected — you are not running this race as a separate primary entry.";
        rollEl.title = "";
      } else if (primaryEl.checked) {
        rollEl.checked = false;
        rollEl.disabled = true;
        rollEl.title =
          "Uncheck primary entry for this race to use qualifier roll-over into it instead.";
        primaryEl.title = "";
      } else {
        primaryEl.disabled = false;
        primaryEl.title = "";
        rollEl.title = "";
      }
    });
  }, [formId, qualifierId, rollOverTargets]);

  const recalc = useCallback(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const primaryChecked = new Set<string>();
    form.querySelectorAll<HTMLInputElement>('input[name="enter_distance"]:checked').forEach((el) => {
      primaryChecked.add(el.value);
    });
    const rollOverChecked = new Set<string>();
    rollOverTargets.forEach((t) => {
      const name = `roll_over_${t.id}_from_${qualifierId}`;
      const el = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (el?.checked) rollOverChecked.add(t.id);
    });
    const lines: CartLine[] = [];
    let total = 0;
    distances.forEach((d) => {
      if (!primaryChecked.has(d.id)) return;
      const cents = d.entry_fee_cents ?? 0;
      const label = d.id === qualifierId ? `${d.label} Peer Racing Qualifier` : d.label;
      lines.push({ label, feeCents: cents });
      total += cents;
    });
    rollOverTargets.forEach((t) => {
      if (!rollOverChecked.has(t.id)) return;
      const cents = t.entry_fee_cents ?? 0;
      lines.push({ label: `${t.label} Roll Over`, feeCents: cents });
      total += cents;
    });
    setLineItems(lines);
    setTotalCents(total);
  }, [formId, distances, qualifierId, rollOverTargets]);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;
    const onChange = () => {
      syncRollOverPrimaryExclusion();
      recalc();
    };
    onChange();
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [formId, recalc, syncRollOverPrimaryExclusion]);

  const feeStr = (cents: number) => (cents === 0 ? "$0" : `$${(cents / 100).toFixed(2)}`);

  return (
    <>
      {distances.map((d) => {
        const isQualifier = qualifierId === d.id;
        const showRollOverHere = isQualifier && rollOverTargets.length > 0;
        const feeCents = d.entry_fee_cents ?? 0;
        const feeStrD = feeCents === 0 ? "$0" : `$${(feeCents / 100).toFixed(2)}`;
        const gunTime = gunTimes[d.id];
        return (
          <div key={d.id} className="mb-4 last:mb-0">
            <label className="flex cursor-pointer flex-wrap items-center gap-2 gap-y-1 text-[#1E3A5F]">
              <input
                type="checkbox"
                name="enter_distance"
                value={d.id}
                className="h-4 w-4 shrink-0 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
              />
              <span className="font-semibold">{d.label}</span>
              <span className="font-normal text-[#1E3A5F]/80">{feeStrD}</span>
              {isQualifier && (
                <span className="rounded bg-[#1E3A5F]/10 px-2 py-0.5 text-xs font-medium text-[#1E3A5F]">
                  Peer Racing Qualifier
                </span>
              )}
              {gunTime && (
                <span className="w-full pl-6 text-sm font-normal text-[#1E3A5F]/60 sm:w-auto sm:pl-0">
                  ({gunTime})
                </span>
              )}
            </label>
            {showRollOverHere && (
              <div className="ml-0 mt-3 rounded-lg border border-[#1E3A5F]/10 bg-white p-3 sm:ml-6">
                <p className="text-sm text-[#1E3A5F]/80">
                  Also use my {qualifierLabel} time for:
                </p>
                {rollOverTargets.map((target) => (
                  <label
                    key={target.id}
                    className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-[#1E3A5F]"
                  >
                    <input
                      type="checkbox"
                      name={`roll_over_${target.id}_from_${qualifierId}`}
                      value="1"
                      className="h-4 w-4 shrink-0 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
                    />
                    {target.label}
                  </label>
                ))}
                <p className="mt-2 text-xs text-[#1E3A5F]/60">
                  You run only the Qualifier; roll-over enters you into the races above without a
                  separate primary entry for those distances. You cannot also check those races as
                  primary — pick roll-over or primary, not both.
                </p>
              </div>
            )}
          </div>
        );
      })}

      {(lineItems.length > 0 || totalCents > 0) && (
        <div className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-white p-4 shadow-sm">
          <div className="font-display text-sm font-semibold text-[#1E3A5F]">Entry fee summary</div>
          {lineItems.map((line) => (
            <div
              key={line.label}
              className="mt-2 flex justify-between gap-4 text-sm text-[#1E3A5F]/80"
            >
              <span>{line.label}</span>
              <span className="shrink-0 font-medium text-[#1E3A5F]">{feeStr(line.feeCents)}</span>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t border-[#1E3A5F]/10 pt-3 font-display text-sm font-semibold text-[#1E3A5F]">
            <span>Total entry fee</span>
            <span>{feeStr(totalCents)}</span>
          </div>
        </div>
      )}
    </>
  );
}
