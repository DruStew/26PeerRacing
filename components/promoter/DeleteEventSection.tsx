"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Props = {
  eventId: string;
  eventName: string;
  entryCount: number;
  publishedDistanceCount: number;
  deleteRedirect?: string;
  demoMode?: boolean;
};

export function DeleteEventSection({
  eventId,
  eventName,
  entryCount,
  publishedDistanceCount,
  deleteRedirect = "/promoter",
  demoMode = false,
}: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmName.trim() === eventName.trim();

  const closeModal = useCallback(() => {
    if (!pending) {
      setModalOpen(false);
      setConfirmName("");
      setError(null);
    }
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

  async function confirmDelete() {
    if (!canConfirm) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/promoter/events/${eventId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_name: confirmName.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}`);
        return;
      }
      router.push(deleteRedirect);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="mt-8 rounded-xl border border-red-200/80 bg-red-50/40 p-6 sm:p-8">
        <h2 className="font-display text-lg font-semibold text-red-900">
          {demoMode ? "Delete demo race" : "Delete Event"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-red-950/80">
          {demoMode
            ? "Removes this demo and all entries, times, and payout settings. Nothing was published or paid out."
            : "Permanently remove this race and all related data — distances, entries, results, badges, kiosk settings, and payout records. This cannot be undone."}
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirmName("");
            setModalOpen(true);
          }}
          className="mt-4 inline-flex items-center justify-center rounded-md border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-800 transition-colors hover:border-red-400 hover:bg-red-50"
        >
          Delete event…
        </button>
      </section>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-event-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-[#1E3A5F]/40 backdrop-blur-[2px]"
            aria-label="Close dialog"
            onClick={closeModal}
          />
          <div className="relative z-[101] w-full max-w-md rounded-2xl border border-[#1E3A5F]/10 bg-white p-6 shadow-xl sm:p-8">
            <h2
              id="delete-event-dialog-title"
              className="font-display text-lg font-semibold leading-snug text-[#1E3A5F] sm:text-xl"
            >
              Delete &ldquo;{eventName}&rdquo;?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#1E3A5F]/80">
              This permanently removes the event and everything tied to it. Runners will no longer
              see it, and any entries or published results will be gone.
            </p>

            {entryCount > 0 ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-600/20">
                <strong>{entryCount}</strong> registration{entryCount === 1 ? "" : "s"} will be
                deleted. Wallet or Stripe refunds are not automatic — handle those separately if
                needed.
              </p>
            ) : null}

            {publishedDistanceCount > 0 ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-600/20">
                <strong>{publishedDistanceCount}</strong> distance
                {publishedDistanceCount === 1 ? " has" : "s have"} published results that will be
                removed.
              </p>
            ) : null}

            <div className="mt-5">
              <label htmlFor="delete-event-confirm" className="text-sm font-medium text-[#1E3A5F]">
                Type <span className="font-semibold">{eventName}</span> to confirm
              </label>
              <input
                id="delete-event-confirm"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                autoComplete="off"
                className="mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/25"
                placeholder={eventName}
              />
            </div>

            {error ? (
              <p className="mt-3 text-sm font-medium text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={pending}
                className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-5 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#1E3A5F]/40 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={pending || !canConfirm}
                className="inline-flex items-center justify-center rounded-md bg-red-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
