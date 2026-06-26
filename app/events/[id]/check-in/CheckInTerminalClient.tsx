"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function CheckInTerminalClient({
  eventId,
  terminalLabel,
}: {
  eventId: string;
  terminalLabel: string;
}) {
  const router = useRouter();
  const [closeStep, setCloseStep] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      void fetch("/api/kiosk/heartbeat", { method: "POST" }).catch(() => {});
    }, 60_000);
    void fetch("/api/kiosk/heartbeat", { method: "POST" }).catch(() => {});
    return () => window.clearInterval(t);
  }, []);

  async function closeTerminal() {
    if (closeStep === 0) {
      setCloseStep(1);
      return;
    }
    if (closeStep === 1) {
      setCloseStep(2);
      const res = await fetch("/api/kiosk/close", { method: "POST" });
      if (res.ok) {
        router.push(`/kiosk/${eventId}`);
        return;
      }
      setCloseStep(0);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-[#1E3A5F]/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[#1E3A5F]/80">
        Terminal <span className="font-semibold text-[#1E3A5F]">{terminalLabel}</span>
      </p>
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        {closeStep === 0 ? (
          <button
            type="button"
            onClick={() => void closeTerminal()}
            className="rounded-md border border-[#1E3A5F]/25 px-4 py-2 text-sm font-semibold text-[#1E3A5F] hover:border-red-600 hover:text-red-800"
          >
            Close terminal
          </button>
        ) : closeStep === 1 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p>Close this terminal? You&apos;ll need the kiosk code to sign in again on this device.</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setCloseStep(0)}
                className="rounded border border-[#1E3A5F]/20 px-3 py-1.5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void closeTerminal()}
                className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Yes, close
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#1E3A5F]/60">Closing…</p>
        )}
      </div>
    </div>
  );
}
