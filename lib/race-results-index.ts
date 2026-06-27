/** Serializable row for the public /results index (client search). */
export type RaceResultsIndexCard = {
  eventId: string;
  eventName: string;
  city: string | null;
  state: string | null;
  raceDate: string | null;
  /** YYYY-MM for month filter, from race_date */
  raceMonth: string | null;
  published: { id: string; label: string | null }[];
  awaiting: { id: string; label: string | null }[];
  awaitingOnly: boolean;
};

export function raceMonthKeyFromDate(raceDate: string | null | undefined): string | null {
  if (!raceDate) return null;
  const m = /^(\d{4})-(\d{2})/.exec(raceDate.trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

export function formatRaceMonthLabel(monthKey: string): string {
  const [y, mo] = monthKey.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return monthKey;
  return new Date(y, mo - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function raceResultsSearchHaystack(card: RaceResultsIndexCard): string {
  const parts = [
    card.eventName,
    card.city ?? "",
    card.state ?? "",
    ...card.published.map((d) => d.label ?? ""),
    ...card.awaiting.map((d) => d.label ?? ""),
  ];
  return parts.join(" ").toLowerCase();
}

export function matchesRaceResultsQuery(card: RaceResultsIndexCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = raceResultsSearchHaystack(card);
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}
