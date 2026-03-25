import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { RenewMembershipForm } from "./RenewMembershipForm";

export default async function MembershipRenewPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const resolved = await searchParams;
    redirect(`/login?returnUrl=${encodeURIComponent(resolved.returnUrl ?? "/membership/renew")}`);
  }

  const resolved = await searchParams;
  const returnUrl = resolved.returnUrl ?? "/events";

  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id,status,membership_end_at,renewal_count")
    .eq("user_id", user.id)
    .single();

  return (
    <main style={{ padding: 24, maxWidth: 480 }}>
      <h1>Renew membership</h1>
      {membership && (
        <p style={{ marginTop: 8, color: "#666" }}>
          {membership.membership_end_at
            ? `Your membership ended ${new Date(membership.membership_end_at).toLocaleDateString()}.`
            : "Your membership is not active."}
        </p>
      )}
      <p style={{ marginTop: 16 }}>
        Renew to create events, enter races, and act as a pacer. Renewal extends your membership by one year.
      </p>
      {/* TODO: Stripe subscription integration placeholder – payment not implemented yet */}
      <RenewMembershipForm returnUrl={returnUrl} />
      <p style={{ marginTop: 24, fontSize: 14 }}>
        <Link href="/events">Browse events</Link> (no membership required)
      </p>
    </main>
  );
}
