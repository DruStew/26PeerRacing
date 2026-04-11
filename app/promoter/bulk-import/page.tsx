import { redirect } from "next/navigation";

import { BulkImportClient } from "@/components/bulk-import/BulkImportClient";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { requireActiveMembership, type MembershipRow } from "@/lib/membership";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function PromoterBulkImportPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent("/promoter/bulk-import")}`);
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select(
      "user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count",
    )
    .eq("user_id", user.id)
    .single();

  requireActiveMembership(membership as MembershipRow | null, "/promoter/bulk-import");

  const { data: events } = await supabase
    .from("events")
    .select("id,name,city,state,race_date, distances(id,label,sort_order)")
    .eq("promoter_id", user.id)
    .order("race_date", { ascending: true });

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />
      <BulkImportClient events={events ?? []} audience="promoter" />
    </div>
  );
}
