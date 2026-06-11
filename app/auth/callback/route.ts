import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isMembershipActive, type MembershipRow } from "@/lib/membership";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnUrl = url.searchParams.get("returnUrl") ?? DEFAULT_PUBLIC_ROUTE;

  if (!code) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", error?.message ?? "auth_failed");
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const redirectTo = returnUrl.startsWith("/") ? returnUrl : DEFAULT_PUBLIC_ROUTE;

  // New-member onboarding: a fresh magic-link signup has no profile and no
  // membership. Route them through profile completion -> membership purchase ->
  // wherever they were headed, instead of dropping them on the events list.
  const userId = data.session.user.id;
  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name,last_name,dob,sex,phone")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const profileComplete = Boolean(
    profile?.first_name?.trim() &&
      profile?.last_name?.trim() &&
      profile?.dob &&
      profile?.sex &&
      profile?.phone?.trim(),
  );
  const membershipActive = isMembershipActive((membership as MembershipRow | null) ?? null);

  let next = redirectTo;
  if (!membershipActive) {
    next = `/membership/renew?returnUrl=${encodeURIComponent(redirectTo)}`;
  }
  if (!profileComplete) {
    next = `/profile/complete?returnUrl=${encodeURIComponent(next)}`;
  }

  return NextResponse.redirect(new URL(next, url.origin), {
    status: 303,
  });
}
