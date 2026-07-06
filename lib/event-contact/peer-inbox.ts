/** Corporate copy of every race contact-form submission (BCC + separate inbox email). */
export function peerRacingEventContactInbox(): string | null {
  const fromEnv = process.env.PEER_RACING_EVENT_CONTACT_INBOX?.trim().toLowerCase();
  if (fromEnv) return fromEnv;
  return "events@peerracing.com";
}
