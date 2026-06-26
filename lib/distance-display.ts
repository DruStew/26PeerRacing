/** Distance row naming: optional individual race name + required distance label. */
export type DistanceNaming = {
  label: string;
  race_name?: string | null;
};

/** Public display: "Kids Run — 1 mile" or "5K" when no race name. */
export function formatDistanceDisplay(d: DistanceNaming): string {
  const distance = d.label.trim();
  const name = d.race_name?.trim() ?? "";
  if (name && distance && name.toLowerCase() !== distance.toLowerCase()) {
    return `${name} — ${distance}`;
  }
  return distance || name || "Race";
}
