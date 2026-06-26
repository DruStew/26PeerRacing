import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    const path = request.nextUrl.pathname;
    if (
      path.startsWith("/kiosk") ||
      path.includes("/check-in") ||
      path === "/api/dev/lan-ping"
    ) {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip")?.trim() ||
        "unknown";
      const ua = request.headers.get("user-agent") ?? "";
      const mobile = /iphone|ipad|android|mobile/i.test(ua);
      console.log(
        `[dev-access] ${request.method} ${path} from ${ip}${mobile ? " (mobile)" : ""}`,
      );
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
