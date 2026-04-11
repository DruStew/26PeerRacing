"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PacerAcceptButton({ entryId, eventId }: { entryId: string; eventId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    setLoading(true);
    try {
      const res = await fetch(`/api/entries/${entryId}/pacer/accept`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.push(`/events/${eventId}`);
        router.refresh();
        return;
      }
      if (res.status === 403 && data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      alert(data.error ?? "Could not accept request");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleAccept}
      disabled={loading}
      className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-wait disabled:opacity-70"
    >
      {loading ? "Accepting…" : "Accept as pacer"}
    </button>
  );
}
