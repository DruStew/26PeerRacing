import "server-only";

import { cache } from "react";

import {
  FALLBACK_MEMBERSHIP_TIERS,
  type MembershipTierConfigRow,
} from "@/lib/membership-tier-config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const fetchMembershipTierConfigs = cache(async (): Promise<MembershipTierConfigRow[]> => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("membership_tier_config")
    .select(
      "slug, display_name, description, price_cents, stripe_price_id, sort_order, rank, is_active, is_paid",
    )
    .order("sort_order", { ascending: true });

  if (error || !data?.length) {
    return FALLBACK_MEMBERSHIP_TIERS;
  }
  return data as MembershipTierConfigRow[];
});

export async function fetchAllMembershipTierConfigsAdmin(): Promise<MembershipTierConfigRow[]> {
  const service = createServiceRoleSupabaseClient();
  const client = service ?? (await createServerSupabaseClient());
  const { data, error } = await client
    .from("membership_tier_config")
    .select(
      "slug, display_name, description, price_cents, stripe_price_id, sort_order, rank, is_active, is_paid",
    )
    .order("sort_order", { ascending: true });

  if (error || !data?.length) {
    return FALLBACK_MEMBERSHIP_TIERS;
  }
  return data as MembershipTierConfigRow[];
}
