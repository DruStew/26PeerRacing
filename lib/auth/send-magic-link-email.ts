import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

const DEFAULT_FROM = "Peer Racing <noreply@peerracing.com>";

function authFromAddress(): string {
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  return from || DEFAULT_FROM;
}

function resendApiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

function buildConfirmLink(args: {
  origin: string;
  tokenHash: string;
  returnUrl: string;
  verificationType: string;
}): string {
  const base = args.origin.replace(/\/$/, "");
  const params = new URLSearchParams({
    token_hash: args.tokenHash,
    type: args.verificationType,
    returnUrl: args.returnUrl,
  });
  return `${base}/auth/confirm?${params.toString()}`;
}

function magicLinkHtml(link: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;color:#1E3A5F;line-height:1.5;">
  <p>Tap the button below to sign in to Peer Racing. This link expires in about an hour and works once.</p>
  <p style="margin:24px 0;">
    <a href="${link}" style="display:inline-block;background:#E87722;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">
      Sign in to Peer Racing
    </a>
  </p>
  <p style="font-size:13px;color:#64748b;">If the button does not work, copy and paste this URL into your browser:</p>
  <p style="font-size:13px;word-break:break-all;">${link}</p>
</body>
</html>`;
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = resendApiKey();
  if (!key) {
    return { ok: false, error: "Email is not configured (missing RESEND_API_KEY)." };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: authFromAddress(),
      to: [args.to],
      subject: args.subject,
      html: args.html,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
  if (!res.ok) {
    const msg = body.message ?? `Email send failed (HTTP ${res.status})`;
    if (body.name === "validation_error" && msg.includes("not verified")) {
      return {
        ok: false,
        error:
          "Signup email is not live yet — peerracing.com must be verified in Resend before we can email new members.",
      };
    }
    return { ok: false, error: msg };
  }

  return { ok: true };
}

/**
 * Mint a magic link with the service role (no Supabase SMTP) and deliver it via Resend.
 */
export async function sendPeerRacingMagicLink(args: {
  email: string;
  origin: string;
  returnUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = args.email.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "Email is required." };
  }

  const admin = createServiceRoleSupabaseClient();
  if (!admin) {
    return { ok: false, error: "Auth is not configured." };
  }

  const returnUrl = args.returnUrl.startsWith("/") ? args.returnUrl : "/";
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${args.origin.replace(/\/$/, "")}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}` },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) {
    return { ok: false, error: "Could not create sign-in link." };
  }

  const verificationType =
    (typeof data.properties?.verification_type === "string" &&
      data.properties.verification_type) ||
    "magiclink";

  const link = buildConfirmLink({
    origin: args.origin,
    tokenHash,
    returnUrl,
    verificationType,
  });

  return sendViaResend({
    to: email,
    subject: "Your Peer Racing sign-in link",
    html: magicLinkHtml(link),
  });
}
