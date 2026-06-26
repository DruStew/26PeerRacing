"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireSuperAdmin } from "@/lib/admin/require-admin";

export async function updateMembershipTier(
  slug: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = await requireAdmin("/admin/memberships");

  const displayName = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const priceRaw = String(formData.get("price_cents") ?? "").trim();
  const stripePriceId = String(formData.get("stripe_price_id") ?? "").trim() || null;
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const rank = Number(formData.get("rank") ?? 0);
  const isActive = formData.get("is_active") === "1";
  const isPaid = formData.get("is_paid") === "1";

  const priceCents = Math.round(Number(priceRaw));
  if (!displayName) {
    return { ok: false, error: "Display name is required." };
  }
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return { ok: false, error: "Price must be a valid non-negative number (cents)." };
  }

  const { error } = await supabase
    .from("membership_tier_config")
    .update({
      display_name: displayName,
      description,
      price_cents: priceCents,
      stripe_price_id: stripePriceId,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      rank: Number.isFinite(rank) ? rank : 0,
      is_active: isActive,
      is_paid: isPaid,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/memberships");
  revalidatePath("/membership/renew");
  return { ok: true };
}

export async function createMembershipTier(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = await requireSuperAdmin("/admin/memberships");

  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const priceCents = Math.round(Number(String(formData.get("price_cents") ?? "0")));
  const stripePriceId = String(formData.get("stripe_price_id") ?? "").trim() || null;
  const sortOrder = Number(formData.get("sort_order") ?? 99);
  const rank = Number(formData.get("rank") ?? 1);
  const isPaid = formData.get("is_paid") === "1";

  if (!slug || slug === "free") {
    return { ok: false, error: "Slug is required (letters, numbers, underscores)." };
  }
  if (!displayName) {
    return { ok: false, error: "Display name is required." };
  }
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return { ok: false, error: "Invalid price." };
  }

  const { error } = await supabase.from("membership_tier_config").insert({
    slug,
    display_name: displayName,
    description,
    price_cents: priceCents,
    stripe_price_id: stripePriceId,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 99,
    rank: Number.isFinite(rank) ? rank : 1,
    is_active: true,
    is_paid: isPaid,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/memberships");
  return { ok: true };
}
