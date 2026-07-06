import { createHash } from "crypto";

import { NextResponse } from "next/server";

import { loadEventIsDemo } from "@/lib/demo/event";
import { peerRacingEventContactInbox } from "@/lib/event-contact/peer-inbox";
import { resolvePromoterContactEmail } from "@/lib/event-contact/resolve-promoter-email";
import { sendEventContactEmail } from "@/lib/event-contact/send-contact-email";
import { isEventContactTopic } from "@/lib/event-contact/topics";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LEN = 4000;
const MAX_NAME_LEN = 120;
const RATE_LIMIT_PER_HOUR = 5;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip")?.trim() ?? "unknown";
}

function ipHash(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function originFromRequest(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "peerracing.com";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** POST — public contact form for a published event (promoter + Peer Racing inbox). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;

  let body: {
    name?: string;
    email?: string;
    topic?: string;
    message?: string;
    website?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.website?.trim()) {
    return NextResponse.json({ ok: true, message: "Thanks — your message was sent." });
  }

  const senderName = String(body.name ?? "").trim().slice(0, MAX_NAME_LEN);
  const senderEmail = String(body.email ?? "").trim().toLowerCase();
  const topic = String(body.topic ?? "").trim();
  const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE_LEN);

  if (!senderName) {
    return NextResponse.json({ ok: false, error: "Your name is required." }, { status: 400 });
  }
  if (!senderEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }
  if (!isEventContactTopic(topic)) {
    return NextResponse.json({ ok: false, error: "Choose a topic." }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ ok: false, error: "Please enter at least 10 characters." }, { status: 400 });
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 503 });
  }

  const { data: event, error: eventErr } = await service
    .from("events")
    .select("id,name,status,promoter_id,organizer_contact_name,organizer_contact_email,is_demo")
    .eq("id", eventId)
    .maybeSingle();

  if (eventErr || !event) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }

  const ev = event as {
    name: string;
    status: string;
    promoter_id: string;
    organizer_contact_name: string | null;
    organizer_contact_email: string | null;
    is_demo?: boolean;
  };

  if (ev.status !== "published" || ev.is_demo) {
    return NextResponse.json({ ok: false, error: "Contact is not available for this event." }, { status: 403 });
  }

  const promoterEmail = await resolvePromoterContactEmail(
    service,
    eventId,
    ev.promoter_id,
    ev.organizer_contact_email,
  );
  if (!promoterEmail) {
    return NextResponse.json(
      { ok: false, error: "This event does not have a contact email configured yet." },
      { status: 503 },
    );
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await service
    .from("event_contact_messages")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("sender_email", senderEmail)
    .gte("created_at", since);

  if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { ok: false, error: "Too many messages sent recently. Please try again in an hour." },
      { status: 429 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const senderUserId = auth.user?.id ?? null;
  const hashedIp = ipHash(clientIp(request));

  const organizerLabel =
    ev.organizer_contact_name?.trim() || `${ev.name} race organizer`;

  const peerInbox = peerRacingEventContactInbox();
  if (!peerInbox) {
    return NextResponse.json({ ok: false, error: "Contact email is not configured." }, { status: 503 });
  }

  const sent = await sendEventContactEmail({
    promoterEmail,
    eventName: ev.name,
    eventId,
    organizerLabel,
    senderName,
    senderEmail,
    topic,
    message,
    origin: originFromRequest(request),
  });

  if (!sent.ok) {
    return NextResponse.json({ ok: false, error: sent.error }, { status: 502 });
  }

  const { error: insertErr } = await service.from("event_contact_messages").insert({
    event_id: eventId,
    sender_name: senderName,
    sender_email: senderEmail,
    sender_user_id: senderUserId,
    topic,
    message,
    ip_hash: hashedIp,
  });

  if (insertErr) {
    console.error("[event-contact] logged email sent but insert failed:", insertErr.message);
  }

  return NextResponse.json({
    ok: true,
    message: "Thanks — your message was sent to the race organizer. They will reply to your email.",
  });
}
