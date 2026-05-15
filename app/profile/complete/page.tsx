import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { ProfileCompleteForm } from "./ProfileCompleteForm";

export default async function ProfileCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const resolved = await searchParams;
    const returnUrl = resolved.returnUrl ?? DEFAULT_PUBLIC_ROUTE;
    redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,dob,sex,active_or_retired_military,phone,email,hometown,home_state,zip")
    .eq("id", user.id)
    .single();

  const resolved = await searchParams;
  const returnUrl = resolved.returnUrl ?? DEFAULT_PUBLIC_ROUTE;

  const phoneInitial =
    (profile?.phone ?? "").trim() || (user.phone ?? "").trim() || "";

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Your Account
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
          Profile
        </h1>
        <p className="mt-3 text-pretty text-[#1E3A5F]/75">
          Keep your details current. We need your legal name, email, cell phone (at least 10
          digits, including area code), date of birth, sex, and active or retired military status
          for race entry, results, and optional payouts. Your cell number helps us reach you on
          race day and will support future text or push notifications.
        </p>

        <ProfileCompleteForm
          userId={user.id}
          initial={{
            first_name: profile?.first_name ?? "",
            last_name: profile?.last_name ?? "",
            dob: profile?.dob ?? "",
            sex: profile?.sex ?? "",
            active_or_retired_military:
              (profile as { active_or_retired_military?: boolean | null } | null)?.active_or_retired_military ??
              null,
            email: profile?.email ?? user.email ?? "",
            phone: phoneInitial,
            hometown: profile?.hometown ?? "",
            home_state: profile?.home_state ?? "",
            zip: profile?.zip ?? "",
          }}
          returnUrl={returnUrl}
        />

        <p className="mt-8 text-center text-sm text-[#1E3A5F]/70 sm:text-left">
          <Link
            href={returnUrl.startsWith("/") ? returnUrl : DEFAULT_PUBLIC_ROUTE}
            className="font-medium text-[#E87722] underline-offset-2 transition-colors hover:underline"
          >
            Cancel and go back
          </Link>
        </p>
      </main>
    </div>
  );
}
