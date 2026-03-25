/**
 * Profile completion: required before entering a race.
 * Required: first_name, last_name, dob, sex, phone, email.
 * Phone is verified via auth (not stored only in profile).
 */
export type ProfileRow = {
  id?: string;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  sex: string | null;
  phone: string | null;
  email: string | null;
};

export function isProfileComplete(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  const first = (profile.first_name ?? "").trim();
  const last = (profile.last_name ?? "").trim();
  const email = (profile.email ?? "").trim();
  const hasDob = profile.dob != null && String(profile.dob).trim() !== "";
  const hasSex = profile.sex === "male" || profile.sex === "female";
  return first.length > 0 && last.length > 0 && hasDob && hasSex && email.length > 0;
}

export const PROFILE_REQUIRED_FIELDS = [
  "First name",
  "Last name",
  "Date of birth",
  "Sex",
  "Email",
] as const;
