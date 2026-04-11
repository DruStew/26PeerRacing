import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
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
  return NextResponse.redirect(new URL(redirectTo, url.origin), {
    status: 303,
  });
}
