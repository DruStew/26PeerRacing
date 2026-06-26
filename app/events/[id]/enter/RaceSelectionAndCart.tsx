"use client";

import { useCallback, useEffect, useState } from "react";

import { formatDistanceDisplay } from "@/lib/distance-display";
import {
  distanceTierRequirementLabel,
  tierCanEnterDistance,
  type MembershipTier,
} from "@/lib/membership-tiers";

type DistanceItem = {
  id: string;
  label: string;
  race_name?: string | null;
  entry_fee_cents: number;
  allow_free_tier?: boolean | null;
  allow_pr_team_tier?: boolean | null;
  allow_top_tier?: boolean | null;
};
type CartLine = { label: string; feeCents: number };

export function RaceSelectionAndCart({
  formId,
  distances,
  qualifierId,
  qualifierLabel,
  rollOverTargets,
  gunTimes,
  walletBalanceCents = 0,
  enteredDistanceIds = [],
  memberTier = "free",
  ignoreTierRestrictions = false,
}: {
  formId: string;
  distances: DistanceItem[];
  qualifierId: string | null;
  qualifierLabel: string;
  rollOverTargets: DistanceItem[];
  gunTimes: Record<string, string>;
  /** Current wallet balance; used to apply credit before Stripe. */
  walletBalanceCents?: number;
  /** Distances the user is already entered in — cannot select again. */
  enteredDistanceIds?: string[];
  memberTier?: MembershipTier;
  /** Walk-up kiosk: allow selecting tier-restricted races (membership upgrade at checkout). */
  ignoreTierRestrictions?: boolean;
}) {
  const enteredSet = new Set(enteredDistanceIds);
  const [lineItems, setLineItems] = useState<CartLine[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [applyWallet, setApplyWallet] = useState(true);

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
          rollEl.title = "Select the main race as a primary entry to use Carry-Over.";
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
          "Carry-Over is selected — you are not running this race as a separate primary entry.";
        rollEl.title = "";
      } else if (primaryEl.checked) {
        rollEl.checked = false;
        rollEl.disabled = true;
        rollEl.title = "Uncheck primary entry for this race to use Carry-Over instead.";
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
      const display = formatDistanceDisplay({ label: d.label, race_name: d.race_name });
      const label = d.id === qualifierId ? `${display} Peer Racing Qualifier` : display;
      lines.push({ label, feeCents: cents });
      total += cents;
    });
    rollOverTargets.forEach((t) => {
      if (!rollOverChecked.has(t.id)) return;
      const cents = t.entry_fee_cents ?? 0;
      lines.push({
        label: `${formatDistanceDisplay({ label: t.label, race_name: t.race_name })} Carry-Over`,
        feeCents: cents,
      });
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
        const alreadyEntered = enteredSet.has(d.id);
        const tierBlocked = !ignoreTierRestrictions && !tierCanEnterDistance(memberTier, d);
        const disabled = alreadyEntered || tierBlocked;
        return (
          <div key={d.id} className="mb-4 last:mb-0">
            <label
              className={`flex flex-wrap items-center gap-2 gap-y-1 text-[#1E3A5F] ${
                disabled ? "cursor-not-allowed opacity-75" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                name="enter_distance"
                value={d.id}
                disabled={disabled}
                className="h-4 w-4 shrink-0 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722] disabled:cursor-not-allowed"
              />
              <span className="font-semibold">
                {formatDistanceDisplay({ label: d.label, race_name: d.race_name })}
              </span>
              <span className="font-normal text-[#1E3A5F]/80">{feeStrD}</span>
              {alreadyEntered ? (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  Already entered
                </span>
              ) : tierBlocked ? (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  {distanceTierRequirementLabel(d)}
                </span>
              ) : ignoreTierRestrictions && !tierCanEnterDistance(memberTier, d) ? (
                <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">
                  Membership Upgrade At Checkout
                </span>
              ) : null}
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
                  Carry-Over your {qualifierLabel} time into:
                </p>
                {rollOverTargets.map((target) => {
                  const rollEntered = enteredSet.has(target.id);
                  return (
                  <label
                    key={target.id}
                    className={`mt-2 flex items-center gap-2 text-sm text-[#1E3A5F] ${
                      rollEntered ? "cursor-not-allowed opacity-75" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name={`roll_over_${target.id}_from_${qualifierId}`}
                      value="1"
                      disabled={rollEntered}
                      className="h-4 w-4 shrink-0 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722] disabled:cursor-not-allowed"
                    />
                    {formatDistanceDisplay({ label: target.label, race_name: target.race_name })}
                    {rollEntered ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        Already entered
                      </span>
                    ) : null}
                  </label>
                );
                })}
                <p className="mt-3 text-sm font-semibold text-[#1E3A5F]">
                  Run Once. Twice the Opportunity to Podium and Win!
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[#1E3A5F]/60">
                  You can enter both distances separately and run both (only if gun/finish times align — you
                  can&apos;t be in two places at the same time) — OR enter the main race and a race above using
                  your &ldquo;Carry-Over&rdquo; time.{" "}
                  {rollOverTargets.length === 1 ? (
                    <>
                      During your long race, we will take your first{" "}
                      <span className="font-medium text-[#1E3A5F]">
                        {formatDistanceDisplay({
                          label: rollOverTargets[0].label,
                          race_name: rollOverTargets[0].race_name,
                        })}
                      </span>{" "}
                      time and that will be your finish time for that race.
                    </>
                  ) : (
                    <>
                      During your long race, we will take your first split at each Carry-Over distance you
                      select above and use that as your finish time for that race.
                    </>
                  )}{" "}
                  You run one race but have finish times in both! You cannot also check those races as primary
                  — pick Carry-Over or primary, not both.
                </p>
              </div>
            )}
          </div>
        );
      })}

      {(lineItems.length > 0 || totalCents > 0) && (
        <div className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-white p-4 shadow-sm">
          <div className="font-display text-sm font-semibold text-[#1E3A5F]">Entry Fee Summary</div>
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
            <span>Total Entry Fee</span>
            <span>{feeStr(totalCents)}</span>
          </div>

          {totalCents > 0 && walletBalanceCents > 0 ? (
            <div className="mt-4 border-t border-[#1E3A5F]/10 pt-4">
              <p className="text-sm text-[#1E3A5F]">
                Wallet: <span className="font-semibold">{feeStr(walletBalanceCents)}</span>
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-[#1E3A5F]">
                <input
                  type="checkbox"
                  name="use_wallet"
                  value="1"
                  checked={applyWallet}
                  onChange={(e) => setApplyWallet(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
                />
                <span>Use wallet toward this entry</span>
              </label>
              {applyWallet ? (
                <div className="mt-3 space-y-1.5 rounded-lg bg-[#1E3A5F]/5 px-3 py-2.5 text-sm text-[#1E3A5F]/90">
                  {(() => {
                    const fromWallet = Math.min(walletBalanceCents, totalCents);
                    const cardDue = Math.max(0, totalCents - fromWallet);
                    return (
                      <>
                        <div className="flex justify-between gap-4">
                          <span>Wallet</span>
                          <span className="font-medium tabular-nums">−{feeStr(fromWallet)}</span>
                        </div>
                        <div className="flex justify-between gap-4 font-semibold">
                          <span>Pay by card</span>
                          <span className="tabular-nums">{feeStr(cardDue)}</span>
                        </div>
                        {cardDue === 0 ? (
                          <p className="pt-1 text-xs font-normal text-emerald-800">Entry fully covered — no card charge.</p>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#1E3A5F]/60">Pay the full entry fee by card.</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
