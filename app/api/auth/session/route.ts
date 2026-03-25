import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!body.access_token || !body.refresh_token) {
    return NextResponse.json(
      { ok: false, error: "Missing access or refresh token" },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ ok: true });
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  response.cookies.set("sb-access-token", body.access_token, cookieOptions);
  response.cookies.set("sb-refresh-token", body.refresh_token, cookieOptions);

  return response;
}
