import type { Metadata } from "next";

/** Build share copy for inviting friends to an event. */
export function buildEventShareText(args: {
  eventName: string;
  raceDateLabel: string | null;
  location: string | null;
  entriesOpen: boolean;
  /** Copy from someone already entered, inviting a friend to join. */
  asRunnerInvite?: boolean;
}): string {
  const when = args.raceDateLabel ? ` on ${args.raceDateLabel}` : "";
  const where =
    args.location && args.location !== "—" ? ` in ${args.location}` : "";

  if (args.asRunnerInvite) {
    const cta = args.entriesOpen
      ? "Let's get you entered — I'd love to have you run with me!"
      : "Check it out on Peer Racing.";
    return `I'm in for ${args.eventName}${when}${where}. ${cta}`;
  }

  const cta = args.entriesOpen
    ? "Let's get entered — I'd love to have you run with me!"
    : "Check it out on Peer Racing.";
  return `${args.eventName}${when}${where}. ${cta}`;
}

export function eventPageMetadata(args: {
  eventName: string;
  description: string;
  path: string;
  artworkUrl?: string | null;
}): Metadata {
  const openGraph: Metadata["openGraph"] = {
    title: args.eventName,
    description: args.description,
    type: "website",
    siteName: "Peer Racing",
  };
  if (args.artworkUrl) {
    openGraph.images = [{ url: args.artworkUrl, alt: args.eventName }];
  }

  return {
    title: `${args.eventName} | Peer Racing`,
    description: args.description,
    openGraph,
    twitter: {
      card: args.artworkUrl ? "summary_large_image" : "summary",
      title: args.eventName,
      description: args.description,
    },
  };
}
