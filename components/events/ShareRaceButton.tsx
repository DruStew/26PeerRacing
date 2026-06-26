"use client";

import { useCallback, useState } from "react";

type Props = {
  /** Path (e.g. /events/uuid) or absolute URL. */
  url: string;
  eventName: string;
  /** Short blurb for texts / share sheet (no URL — added automatically). */
  shareText: string;
  className?: string;
};

function fullUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (typeof window === "undefined") return url;
  return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
}

export function ShareRaceButton({ url, eventName, shareText, className }: Props) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const share = useCallback(async () => {
    setFeedback(null);
    const link = fullUrl(url);
    const message = `${shareText.trim()}\n\n${link}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: eventName,
          text: shareText.trim(),
          url: link,
        });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(message);
      setFeedback("Link copied!");
    } catch {
      setFeedback("Copy failed — select the link manually.");
    }
    window.setTimeout(() => setFeedback(null), 2500);
  }, [url, eventName, shareText]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void share()}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#1E3A5F]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] shadow-sm transition-colors hover:border-[#E87722] hover:text-[#E87722]"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
        {feedback ?? "Share race"}
      </button>
      <p className="mt-1.5 text-xs text-[#1E3A5F]/55">
        Text a friend — they&apos;ll land on this page ready to enter.
      </p>
    </div>
  );
}
