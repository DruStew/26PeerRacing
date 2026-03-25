import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MembershipRenewedPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main style={{ padding: 24, maxWidth: 480, textAlign: "center" }}>
      <h1>Welcome Back</h1>
      <p style={{ fontSize: 18, marginTop: 16 }}>Membership Renewed</p>
      <p style={{ marginTop: 24 }}>
        <Link href="/events">Browse events</Link>
      </p>
    </main>
  );
}
