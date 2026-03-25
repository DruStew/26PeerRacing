import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Birthday benefit: $25 credit during birthday month, one per membership year.
 * Credit applies to PR race fees or side pot fees only.
 * At checkout: apply remaining_amount_cents to PR fees, deduct, update status (TODO: integrate at payment).
 */

const BIRTHDAY_CREDIT_CENTS = 2500; // $25

export type MembershipRow = {
  user_id: string;
  membership_end_at: string | null;
};

export function getBirthdayMonthBounds(dob: string): { availableFrom: Date; expiresAt: Date } | null {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const year = new Date().getFullYear();
  const first = new Date(year, d.getMonth(), 1, 0, 0, 0, 0);
  const last = new Date(year, d.getMonth() + 1, 0, 23, 59, 59, 999);
  const now = new Date();
  if (now < first || now > last) return null;
  return { availableFrom: first, expiresAt: last };
}

export async function ensureBirthdayBenefit(
  supabase: SupabaseClient,
  userId: string,
  dob: string | null,
  membershipEndAt: string | null
): Promise<void> {
  if (!dob || !membershipEndAt) return;
  const bounds = getBirthdayMonthBounds(dob);
  if (!bounds) return;

  const { data: existing } = await supabase
    .from("membership_benefits")
    .select("id")
    .eq("user_id", userId)
    .eq("benefit_type", "birthday_credit")
    .eq("membership_year_reference", membershipEndAt)
    .maybeSingle();

  if (existing) return;

  await supabase.from("membership_benefits").insert({
    user_id: userId,
    benefit_type: "birthday_credit",
    total_amount_cents: BIRTHDAY_CREDIT_CENTS,
    remaining_amount_cents: BIRTHDAY_CREDIT_CENTS,
    available_from: bounds.availableFrom.toISOString(),
    expires_at: bounds.expiresAt.toISOString(),
    status: "available",
    membership_year_reference: membershipEndAt,
    updated_at: new Date().toISOString(),
  });
}
