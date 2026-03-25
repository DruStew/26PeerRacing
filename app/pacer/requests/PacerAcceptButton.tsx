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
      style={{ padding: "6px 12px", cursor: loading ? "wait" : "pointer" }}
    >
      {loading ? "Accepting…" : "Accept as pacer"}
    </button>
  );
}
