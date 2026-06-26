"use client";

import { FormEvent } from "react";

import { RaceSelectionAndCart } from "@/app/events/[id]/enter/RaceSelectionAndCart";
import type { MembershipTier } from "@/lib/membership-tiers";

type EnterFlowDistance = {
  id: string;
  label: string;
  race_name?: string | null;
  entry_fee_cents: number;
  allow_free_tier?: boolean | null;
  allow_pr_team_tier?: boolean | null;
  allow_top_tier?: boolean | null;
};

export type KioskEnterFlow = {
  distances: EnterFlowDistance[];
  qualifierId: string | null;
  qualifierLabel: string;
  rollOverTargets: EnterFlowDistance[];
  gunTimes: Record<string, string>;
  enteredDistanceIds: string[];
  walletBalanceCents: number;
  memberTier: MembershipTier;
  hasPaidEntryFees: boolean;
};

const FORM_ID = "kiosk-walk-up-enter-form";

export function KioskWalkUpEntryForm({
  enterFlow,
  pending,
  profileComplete,
  onSubmit,
}: {
  enterFlow: KioskEnterFlow;
  pending: boolean;
  profileComplete: boolean;
  onSubmit: (payload: {
    primaryDistanceIds: string[];
    rollOverSelections: { targetDistanceId: string; sourceDistanceId: string }[];
    useWallet: boolean;
  }) => void | Promise<void>;
}) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const primaryDistanceIds = formData
      .getAll("enter_distance")
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    const rollOverSelections: { targetDistanceId: string; sourceDistanceId: string }[] = [];
    if (enterFlow.qualifierId) {
      for (const [key, value] of formData.entries()) {
        if (typeof value !== "string" || value !== "1") continue;
        const m = key.match(/^roll_over_(.+)_from_(.+)$/);
        if (!m) continue;
        const [, targetId, sourceId] = m;
        if (sourceId === enterFlow.qualifierId) {
          rollOverSelections.push({ targetDistanceId: targetId, sourceDistanceId: sourceId });
        }
      }
    }

    if (primaryDistanceIds.length === 0 && rollOverSelections.length === 0) {
      return;
    }

    void onSubmit({
      primaryDistanceIds,
      rollOverSelections,
      useWallet: formData.get("use_wallet") === "1",
    });
  }

  if (enterFlow.distances.length === 0) {
    return (
      <p className="text-sm text-[#1E3A5F]/70">No open races are available for entry at this event.</p>
    );
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-6">
      {!profileComplete ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          Profile is incomplete — use <strong>Create new PR member</strong> to fill in date of birth, sex, and
          military status before entering.
        </div>
      ) : null}

      <fieldset className="rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 p-4 sm:p-6">
        <legend className="sr-only">Races</legend>
        <p className="font-display text-lg font-semibold text-[#1E3A5F]">Races</p>
        <p className="mb-4 mt-1 text-sm text-[#1E3A5F]/70">
          Choose at least one race. Order follows event schedule. Membership upgrade is included at checkout when
          required.
        </p>
        <RaceSelectionAndCart
          formId={FORM_ID}
          distances={enterFlow.distances}
          qualifierId={enterFlow.qualifierId}
          qualifierLabel={enterFlow.qualifierLabel}
          rollOverTargets={enterFlow.rollOverTargets}
          gunTimes={enterFlow.gunTimes}
          walletBalanceCents={enterFlow.walletBalanceCents}
          enteredDistanceIds={enterFlow.enteredDistanceIds}
          memberTier={enterFlow.memberTier}
          ignoreTierRestrictions
        />
      </fieldset>

      <button
        type="submit"
        disabled={pending || !profileComplete}
        className="inline-flex w-full items-center justify-center rounded-md bg-[#E87722] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Working…" : enterFlow.hasPaidEntryFees ? "Continue to payment" : "Submit entry"}
      </button>
    </form>
  );
}
