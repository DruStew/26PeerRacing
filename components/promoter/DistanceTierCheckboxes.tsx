"use client";

import { useCallback, useState } from "react";

type Props = {
  /** Initial values when editing an existing distance. */
  initialFree?: boolean;
  initialPrTeam?: boolean;
  initialTopTier?: boolean;
};

/**
 * Promoter UI: who can enter this race distance.
 * Checking Free auto-checks all tiers (open to any PR member).
 */
export function DistanceTierCheckboxes({
  initialFree = false,
  initialPrTeam = true,
  initialTopTier = true,
}: Props) {
  const [free, setFree] = useState(initialFree);
  const [prTeam, setPrTeam] = useState(initialPrTeam);
  const [topTier, setTopTier] = useState(initialTopTier);

  const onFreeChange = useCallback((checked: boolean) => {
    if (checked) {
      setFree(true);
      setPrTeam(true);
      setTopTier(true);
    } else {
      setFree(false);
    }
  }, []);

  const boxClass =
    "h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]";

  return (
    <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
      <p className="font-display text-base font-semibold text-[#1E3A5F]">Who Can Enter This Race?</p>
      <p className="mt-2 text-sm leading-relaxed text-[#1E3A5F]/70">
        PR-Team and Top Tier are pre-selected for most races. Check <strong>Free tier</strong> only when
        the race is open to every Peer Racing member.
      </p>
      <div className="mt-4 space-y-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-[#1E3A5F]">
          <input
            type="checkbox"
            name="allow_free_tier"
            value="1"
            checked={free}
            onChange={(e) => onFreeChange(e.target.checked)}
            className={`${boxClass} mt-0.5`}
          />
          <span>
            <span className="font-semibold">Free tier</span>
            <span className="mt-0.5 block text-xs font-normal text-[#1E3A5F]/65">
              Any Peer Racing member — checking this selects all tiers below.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-[#1E3A5F]">
          <input
            type="checkbox"
            name="allow_pr_team_tier"
            value="1"
            checked={prTeam}
            onChange={(e) => setPrTeam(e.target.checked)}
            disabled={free}
            className={`${boxClass} mt-0.5 disabled:opacity-60`}
          />
          <span>
            <span className="font-semibold">PR-Team</span> ($50/yr)
            <span className="mt-0.5 block text-xs font-normal text-[#1E3A5F]/65">
              Standard paid members — Top Tier members also qualify.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-[#1E3A5F]">
          <input
            type="checkbox"
            name="allow_top_tier"
            value="1"
            checked={topTier}
            onChange={(e) => setTopTier(e.target.checked)}
            disabled={free}
            className={`${boxClass} mt-0.5 disabled:opacity-60`}
          />
          <span>
            <span className="font-semibold">Top Tier</span> ($250/yr)
            <span className="mt-0.5 block text-xs font-normal text-[#1E3A5F]/65">
              Premium members only when PR-Team is unchecked.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
