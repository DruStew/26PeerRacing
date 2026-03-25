import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProfileCompleteForm } from "./ProfileCompleteForm";

export default async function ProfileCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const resolved = await searchParams;
    const returnUrl = resolved.returnUrl ?? "/events";
    redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,dob,sex,phone,email")
    .eq("id", user.id)
    .single();

  const resolved = await searchParams;
  const returnUrl = resolved.returnUrl ?? "/events";

  return (
    <main style={{ padding: 24, maxWidth: 480 }}>
      <h1>Complete your profile</h1>
      <p>
        You need a complete profile before entering a race: first name, last name, date of birth, sex, and email.
        Phone is already verified.
      </p>
      <ProfileCompleteForm
        userId={user.id}
        initial={{ first_name: profile?.first_name ?? "", last_name: profile?.last_name ?? "", dob: profile?.dob ?? "", sex: profile?.sex ?? "", email: profile?.email ?? user.email ?? "" }}
        returnUrl={returnUrl}
        phone={user.phone ?? undefined}
      />
    </main>
  );
}
