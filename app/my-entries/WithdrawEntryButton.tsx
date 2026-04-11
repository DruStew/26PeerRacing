"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function WithdrawEntryButton({
  entryId,
  disabled,
  label = "Withdraw from this race",
  hasLinkedRollOvers,
}: {
  entryId: string;
  disabled: boolean;
  label?: string;
  hasLinkedRollOvers?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    const extra =
      hasLinkedRollOvers === true
        ? " This will also remove your linked qualifier roll-over entries for this event."
        : "";
    if (
      !confirm(
        `Withdraw from this race?${extra} You can register again before registration closes if you change your mind. Entry fees are not refunded after registration closes.`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}/withdraw`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
        return;
      }
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

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void withdraw()}
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
    </div>
  );
}
