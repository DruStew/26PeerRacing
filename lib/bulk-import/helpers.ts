export function digitsPhone(p: unknown): string {
  return String(p ?? "").replace(/\D/g, "");
}

export function formatDob(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    const t = Date.parse(String(v));
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    return null;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

export function mapSex(m: unknown): "male" | "female" | null {
  const u = String(m ?? "").trim().toUpperCase();
  if (u === "M" || u === "MALE") return "male";
  if (u === "F" || u === "FEMALE") return "female";
  return null;
}

/** Empty or unrecognized → false (not military). Y/yes/1/true → true. */
export function mapActiveOrRetiredMilitary(v: unknown): boolean {
  const u = String(v ?? "").trim().toLowerCase();
  if (u === "y" || u === "yes" || u === "true" || u === "1") return true;
  return false;
}

export function normEmail(e: unknown): string {
  return String(e ?? "")
    .trim()
    .toLowerCase();
}
