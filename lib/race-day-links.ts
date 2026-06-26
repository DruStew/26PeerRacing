export type RaceDayLink = {
  label: string;
  url: string;
};

const MARKDOWN_LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeRaceDayLinks(links: RaceDayLink[]): RaceDayLink[] {
  const out: RaceDayLink[] = [];
  for (const link of links) {
    const label = link.label?.trim() ?? "";
    const url = link.url?.trim() ?? "";
    if (!label || !isSafeExternalUrl(url)) continue;
    out.push({ label, url });
  }
  return out;
}

export function parseRaceDayLinksJson(raw: unknown): RaceDayLink[] {
  if (!Array.isArray(raw)) return [];
  const parsed: RaceDayLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { label?: unknown; url?: unknown };
    if (typeof row.label !== "string" || typeof row.url !== "string") continue;
    parsed.push({ label: row.label, url: row.url });
  }
  return normalizeRaceDayLinks(parsed);
}

/** Pull legacy markdown links out of notes text (one-time hydrate on edit). */
export function extractMarkdownLinksFromNotes(notes: string): {
  links: RaceDayLink[];
  cleanNotes: string;
} {
  const links: RaceDayLink[] = [];
  for (const match of notes.matchAll(MARKDOWN_LINK_RE)) {
    const label = match[1]?.trim() ?? "";
    const url = match[2]?.trim() ?? "";
    if (label && isSafeExternalUrl(url)) {
      links.push({ label, url });
    }
  }
  const cleanNotes = notes.replace(MARKDOWN_LINK_RE, "").replace(/[ \t]+\n/g, "\n").trim();
  return { links: normalizeRaceDayLinks(links), cleanNotes };
}

export function hydrateRaceDayLinks(
  storedLinks: unknown,
  notes: string | null | undefined,
): { raceDayNotes: string; raceDayLinks: RaceDayLink[] } {
  const parsed = parseRaceDayLinksJson(storedLinks);
  if (parsed.length > 0) {
    return { raceDayNotes: notes?.trim() ?? "", raceDayLinks: parsed };
  }
  const rawNotes = notes?.trim() ?? "";
  if (!rawNotes) return { raceDayNotes: "", raceDayLinks: [] };
  const { links, cleanNotes } = extractMarkdownLinksFromNotes(rawNotes);
  return { raceDayNotes: cleanNotes, raceDayLinks: links };
}
