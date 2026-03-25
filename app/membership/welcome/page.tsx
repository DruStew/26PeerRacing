import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MembershipWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const resolved = await searchParams;
  const returnUrl = resolved.returnUrl ?? "/events";

  await supabase
    .from("memberships")
    .update({ welcome_shown_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  return (
    <main style={{ padding: 24, maxWidth: 480, textAlign: "center" }}>
      <h1>Welcome to Peer Racing</h1>
      <p style={{ fontSize: 18, marginTop: 16 }}>Membership Activated</p>
      <p style={{ marginTop: 24 }}>
        <Link href={returnUrl.startsWith("/") ? returnUrl : "/events"}>Continue</Link>
      </p>
    </main>
  );
}
