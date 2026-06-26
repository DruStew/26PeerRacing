import { NextResponse } from "next/server";

import { authKioskOrPromoterForEvent } from "@/lib/kiosk/auth-kiosk-or-promoter-event";
import {
  createOrUpdateWalkUpMember,
  validateWalkUpMemberInput,
} from "@/lib/kiosk/walk-up-member";

export const dynamic = "force-dynamic";

/**
 * Create a new Peer Racing member at the kiosk (or update an existing profile).
 * Sends a magic link to their email so they can sign in on their phone later.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  if (!eventId) {
    return NextResponse.json({ ok: false, error: "Missing eventId" }, { status: 400 });
  }

  const auth = await authKioskOrPromoterForEvent(request, eventId);
  if (!auth.ok) {
    return auth.response;
  }

  const input = validateWalkUpMemberInput(body as Parameters<typeof validateWalkUpMemberInput>[0]);
  if (!input) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Please fill in first name, last name, email, cell phone, date of birth, sex, and military status.",
      },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;
  const result = await createOrUpdateWalkUpMember(auth.admin, input, origin);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    userId: result.userId,
    created: result.created,
    magicLinkSent: result.magicLinkSent,
    pr_id: result.pr_id,
    message: result.magicLinkSent
      ? `Account ready. Magic link sent to ${input.email}.`
      : `Account ready for ${input.first_name} ${input.last_name}. Could not send email — they can sign in at peer-racing.com/login.`,
  });
}
