"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { MY_ENTRIES_ROUTE } from "@/lib/routes";

type Props = {
  eventId: string;
  /** User is entered in every distance still open for entry. */
  allEntered: boolean;
  enteredLabels: string[];
};

export function EventEnterButton({ eventId, allEntered, enteredLabels }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const closeModal = useCallback(() => setModalOpen(false), []);

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

  if (allEntered) {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center rounded-md border border-emerald-600/30 bg-emerald-50 px-6 py-3 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-100"
        >
          You&apos;re already entered
        </button>

        {modalOpen ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="already-entered-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-[#1E3A5F]/40 backdrop-blur-[2px]"
              aria-label="Close dialog"
              onClick={closeModal}
            />
            <div className="relative z-[101] w-full max-w-md rounded-2xl border border-[#1E3A5F]/10 bg-white p-6 shadow-xl sm:p-8">
              <h2
                id="already-entered-title"
                className="font-display text-lg font-semibold text-[#1E3A5F] sm:text-xl"
              >
                You&apos;re Already Entered
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#1E3A5F]/80">
                You have a registration for{" "}
                {enteredLabels.length > 0 ? enteredLabels.join(", ") : "this event"}. You don&apos;t
                need to enter again.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-5 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#1E3A5F]/40"
                >
                  Close
                </button>
                <Link
                  href={MY_ENTRIES_ROUTE}
                  className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
                >
                  View my entries
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <Link
      href={`/events/${eventId}/enter`}
      className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
    >
      Enter race
    </Link>
  );
}
