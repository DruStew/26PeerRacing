/** Peer Racing membership tiers (launch). */
export type MembershipTier = "free" | "pr_team" | "top_tier";

export const MEMBERSHIP_TIER_LABELS: Record<MembershipTier, string> = {
  free: "Free",
  pr_team: "PR-Team",
  top_tier: "Top Tier",
};

export type DistanceTierAccess = {
  allow_free_tier?: boolean | null;
  allow_pr_team_tier?: boolean | null;
  allow_top_tier?: boolean | null;
};

export function normalizeDistanceTierAccess(d: DistanceTierAccess): {
  free: boolean;
  prTeam: boolean;
  topTier: boolean;
} {
  return {
    free: d.allow_free_tier === true,
    prTeam: d.allow_pr_team_tier !== false,
    topTier: d.allow_top_tier !== false,
  };
}

/** Whether a member tier may enter a race with the given distance flags. */
export function tierCanEnterDistance(
  memberTier: MembershipTier,
  distance: DistanceTierAccess,
): boolean {
  const allowed = normalizeDistanceTierAccess(distance);
  if (allowed.free) return true;
  if (memberTier === "top_tier") return allowed.topTier || allowed.prTeam;
  if (memberTier === "pr_team") return allowed.prTeam;
  return false;
}

/** Human-readable requirement for UI when entry is blocked. */
export function distanceTierRequirementLabel(distance: DistanceTierAccess): string {
  const allowed = normalizeDistanceTierAccess(distance);
  if (allowed.free) return "Open to all Peer Racing members";
  if (allowed.prTeam && allowed.topTier) return "PR-Team or Top Tier membership required";
  if (allowed.topTier && !allowed.prTeam) return "Top Tier membership required";
  if (allowed.prTeam) return "PR-Team membership required";
  return "Membership required";
}

export function minimumPaidTierForDistance(distance: DistanceTierAccess): MembershipTier | null {
  const allowed = normalizeDistanceTierAccess(distance);
  if (allowed.free) return null;
  if (allowed.prTeam) return "pr_team";
  if (allowed.topTier) return "top_tier";
  return "top_tier";
}

export function tierRank(tier: MembershipTier): number {
  switch (tier) {
    case "free":
      return 0;
    case "pr_team":
      return 1;
    case "top_tier":
      return 2;
  }
}

export function isPaidTier(tier: MembershipTier): boolean {
  return tier === "pr_team" || tier === "top_tier";
}

/** Parse distance tier flags from promoter form POST. */
export function parseDistanceTierFlagsFromForm(formData: FormData): {
  allow_free_tier: boolean;
  allow_pr_team_tier: boolean;
  allow_top_tier: boolean;
} {
  const allow_free_tier = formData.get("allow_free_tier") === "1";
  const allow_pr_team_tier = allow_free_tier ? true : formData.get("allow_pr_team_tier") === "1";
  const allow_top_tier = allow_free_tier ? true : formData.get("allow_top_tier") === "1";
  return { allow_free_tier, allow_pr_team_tier, allow_top_tier };
}
