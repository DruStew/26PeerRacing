/**
 * Profile completion: required before entering a race.
 * Required: first_name, last_name, dob, sex, active_or_retired_military, phone, email.
 * Phone is stored on profiles (cell); may also exist on auth user for OTP login.
 */
export type ProfileRow = {
  id?: string;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  sex: string | null;
  /** Active or retired military (self-reported); used for military incentive payouts. */
  active_or_retired_military: boolean | null;
  phone: string | null;
  email: string | null;
  /** Optional; for local race marketing. */
  hometown?: string | null;
  home_state?: string | null;
  zip?: string | null;
};

/**
 * At least 10 digits after stripping non-digits (US numbers + country codes, etc.).
 * Rejects empty or junk one-off entries so we actually collect a usable cell.
 */
export function isPlausibleCellPhone(value: string | null | undefined): boolean {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10;
}

export function isProfileComplete(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  const first = (profile.first_name ?? "").trim();
  const last = (profile.last_name ?? "").trim();
  const email = (profile.email ?? "").trim();
  const phone = (profile.phone ?? "").trim();
  const hasDob = profile.dob != null && String(profile.dob).trim() !== "";
  const hasSex = profile.sex === "male" || profile.sex === "female";
  const hasMilitary =
    profile.active_or_retired_military === true || profile.active_or_retired_military === false;
  return (
    first.length > 0 &&
    last.length > 0 &&
    hasDob &&
    hasSex &&
    hasMilitary &&
    email.length > 0 &&
    isPlausibleCellPhone(phone)
  );
}

export const PROFILE_REQUIRED_FIELDS = [
  "First name",
  "Last name",
  "Date of birth",
  "Sex",
  "Active or retired military",
  "Email",
  "Cell phone",
] as const;
