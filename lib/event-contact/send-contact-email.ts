import "server-only";

import type { EventContactTopic } from "@/lib/event-contact/topics";
import { eventContactTopicLabel } from "@/lib/event-contact/topics";
import { peerRacingEventContactInbox } from "@/lib/event-contact/peer-inbox";

const DEFAULT_FROM = "Peer Racing <noreply@peerracing.com>";

function emailFromAddress(): string {
  return process.env.AUTH_EMAIL_FROM?.trim() || DEFAULT_FROM;
}

function resendApiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function contactEmailHtml(args: {
  eventName: string;
  eventId: string;
  organizerLabel: string;
  senderName: string;
  senderEmail: string;
  topic: EventContactTopic;
  message: string;
  eventUrl: string;
}): string {
  const topicLabel = eventContactTopicLabel(args.topic);
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;color:#1E3A5F;line-height:1.55;max-width:640px;">
  <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Peer Racing — race contact form</p>
  <h1 style="margin:0 0 16px;font-size:20px;color:#1E3A5F;">Question about ${escapeHtml(args.eventName)}</h1>
  <p style="margin:0 0 16px;">A message was sent through the public contact form for <strong>${escapeHtml(args.organizerLabel)}</strong>.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 0;color:#64748b;width:120px;">From</td><td style="padding:6px 0;">${escapeHtml(args.senderName)} &lt;${escapeHtml(args.senderEmail)}&gt;</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">Topic</td><td style="padding:6px 0;">${escapeHtml(topicLabel)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;vertical-align:top;">Message</td><td style="padding:6px 0;white-space:pre-wrap;">${escapeHtml(args.message)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;">Event</td><td style="padding:6px 0;"><a href="${escapeHtml(args.eventUrl)}">${escapeHtml(args.eventName)}</a></td></tr>
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#64748b;">Reply directly to this email to reach ${escapeHtml(args.senderName)}.</p>
</body>
</html>`;
}

async function sendViaResend(args: {
  to: string[];
  bcc?: string[];
  replyTo: string;
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
      from: emailFromAddress(),
      to: args.to,
      ...(args.bcc?.length ? { bcc: args.bcc } : {}),
      reply_to: args.replyTo,
      subject: args.subject,
      html: args.html,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
  if (!res.ok) {
    return { ok: false, error: body.message ?? `Email send failed (HTTP ${res.status})` };
  }
  return { ok: true };
}

export async function sendEventContactEmail(args: {
  promoterEmail: string;
  eventName: string;
  eventId: string;
  organizerLabel: string;
  senderName: string;
  senderEmail: string;
  topic: EventContactTopic;
  message: string;
  origin: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const peerInbox = peerRacingEventContactInbox();
  if (!peerInbox) {
    return { ok: false, error: "Peer Racing contact inbox is not configured." };
  }

  const eventUrl = `${args.origin.replace(/\/$/, "")}/events/${args.eventId}`;
  const subject = `[${args.eventName}] ${eventContactTopicLabel(args.topic)} — ${args.senderName}`;
  const html = contactEmailHtml({
    eventName: args.eventName,
    eventId: args.eventId,
    organizerLabel: args.organizerLabel,
    senderName: args.senderName,
    senderEmail: args.senderEmail,
    topic: args.topic,
    message: args.message,
    eventUrl,
  });

  const bcc = peerInbox.toLowerCase() === args.promoterEmail.toLowerCase() ? undefined : [peerInbox];

  return sendViaResend({
    to: [args.promoterEmail],
    bcc,
    replyTo: args.senderEmail,
    subject,
    html,
  });
}
