import type { SupabaseClient } from "@supabase/supabase-js";

/** Effective inbox for contact-form delivery (override or promoter profile email). */
export async function resolvePromoterContactEmail(
  client: SupabaseClient,
  eventId: string,
  promoterId: string,
  organizerContactEmail: string | null | undefined,
): Promise<string | null> {
  const override = organizerContactEmail?.trim().toLowerCase();
  if (override) return override;

  const { data: profile } = await client
    .from("profiles")
    .select("email")
    .eq("id", promoterId)
    .maybeSingle();

  const profileEmail = (profile as { email?: string | null } | null)?.email?.trim().toLowerCase();
  if (profileEmail) return profileEmail;

  return null;
}
