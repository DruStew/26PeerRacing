import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

type PendingCookie = { name: string; value: string; options: CookieOptions };

/** Collect session cookies during auth, then attach them to the final redirect response. */
export function createAuthRouteHandlerSupabaseClient(request: NextRequest, jar: PendingCookie[]) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach((cookie) => {
          request.cookies.set(cookie.name, cookie.value);
          jar.push(cookie);
        });
      },
    },
  });
}

export function redirectWithAuthCookies(
  url: URL,
  jar: PendingCookie[],
  init?: ResponseInit,
): NextResponse {
  const response = NextResponse.redirect(url, init);
  jar.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}
