"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/** Kiosk tablet: sync Stripe race entry after redirect (runner is not logged in on this device). */
export function CheckInStripeSync({ eventId }: { eventId: string }) {
  const searchParams = useSearchParams();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const sessionId = searchParams.get("session_id");
    const ok = searchParams.get("checkout");
    if (ok !== "success" || !sessionId) return;
    done.current = true;
    void fetch("/api/kiosk/check-in/sync-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, sessionId }),
    }).catch(() => {});
  }, [eventId, searchParams]);

  return null;
}
