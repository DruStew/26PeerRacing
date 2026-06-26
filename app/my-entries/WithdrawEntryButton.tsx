"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function WithdrawEntryButton({
  entryId,
  distanceLabel,
  disabled,
  label = "Withdraw from this race",
  hasLinkedRollOvers,
}: {
  entryId: string;
  distanceLabel: string;
  disabled: boolean;
  label?: string;
  hasLinkedRollOvers?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const closeModal = useCallback(() => {
    if (!pending) setModalOpen(false);
  }, [pending]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen, closeModal]);

  async function confirmWithdraw() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}/withdraw`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
        return;
      }
      setModalOpen(false);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (disabled) {
    return (
      <p className="text-sm text-[#1E3A5F]/55">
        Registration has closed — withdrawals are no longer available. Entry fees are not refunded.
      </p>
    );
  }

  const dist = distanceLabel.trim() || "this race";

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setModalOpen(true);
        }}
        disabled={pending}
        className="text-sm font-semibold text-[#1E3A5F]/80 underline-offset-2 transition-colors hover:text-red-800 hover:underline disabled:opacity-60"
      >
        {pending ? "Withdrawing…" : label}
      </button>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-[#1E3A5F]/40 backdrop-blur-[2px]"
            aria-label="Close dialog"
            onClick={closeModal}
          />
          <div className="relative z-[101] w-full max-w-md rounded-2xl border border-[#1E3A5F]/10 bg-white p-6 shadow-xl sm:p-8">
            <div className="flex justify-center">
              <Image
                src="/PR_LOGO_COLOR.png"
                alt="Peer Racing"
                width={320}
                height={128}
                className="h-14 w-auto sm:h-16"
                priority
              />
            </div>

            <h2
              id="withdraw-dialog-title"
              className="font-display mt-6 text-center text-lg font-semibold leading-snug text-[#1E3A5F] sm:text-xl"
            >
              You are withdrawing from the {dist} distance.
            </h2>

            <p className="mt-4 text-center text-sm leading-relaxed text-[#1E3A5F]/85">
              Once confirmed, your full entry fee will be in your wallet. You can use this for future
              entries or have the amount refunded less the initial processing fee.
            </p>

            {hasLinkedRollOvers === true ? (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-center text-sm text-amber-950/90 ring-1 ring-amber-600/20">
                This will also remove your linked qualifier Carry-Over entries for this event.
              </p>
            ) : null}

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center sm:gap-4">
              <button
                type="button"
                onClick={closeModal}
                disabled={pending}
                className="w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:bg-[#1E3A5F]/05 disabled:opacity-50 sm:w-auto sm:min-w-[120px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmWithdraw()}
                disabled={pending}
                className="w-full rounded-lg bg-[#E87722] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:opacity-60 sm:w-auto sm:min-w-[160px]"
              >
                {pending ? "Confirming…" : "Confirm withdrawal"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
