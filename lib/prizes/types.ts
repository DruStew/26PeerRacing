export const PRIZE_CATEGORIES = ["main", "female", "military"] as const;
export type PrizeCategory = (typeof PRIZE_CATEGORIES)[number];

export type PrizeSettings = {
  distance_id: string;
  current_config_id: string;
  main_prizes_enabled: boolean;
  female_prizes_enabled: boolean;
  military_prizes_enabled: boolean;
  show_individual_retail_values: boolean;
  show_total_award_value: boolean;
  updated_at: string;
};

export type PrizeRule = {
  id?: string;
  category: PrizeCategory;
  /** Null is the shared schedule; a name is a division-specific override. */
  division: string | null;
  place: number;
  sort_order: number;
  prize_name: string;
  cost_cents: number;
  retail_value_cents: number;
};

export type PrizeConfiguration = {
  settings: PrizeSettings | null;
  rules: PrizeRule[];
};

export function rulesForPlacement(
  rules: PrizeRule[],
  category: PrizeCategory,
  division: string,
  place: number,
): PrizeRule[] {
  const exact = rules.filter(
    (rule) => rule.category === category && rule.division === division && rule.place === place,
  );
  const selected =
    exact.length > 0
      ? exact
      : rules.filter(
          (rule) => rule.category === category && rule.division == null && rule.place === place,
        );
  return [...selected].sort((a, b) => a.sort_order - b.sort_order || a.prize_name.localeCompare(b.prize_name));
}
