"use client";

import { useRef, useState } from "react";

/**
 * Distance editor: "PR Results powered by" sponsor logo for racer share
 * graphics. One upload covers the whole event (other distances inherit it);
 * uploading here overrides just this distance.
 */

type Props = {
  eventId: string;
  distanceId: string;
  /** This distance's own logo (null = inheriting or none). */
  ownLogoUrl: string | null;
  /** Logo inherited from another distance, if any. */
  inheritedLogoUrl: string | null;
};

export function SponsorLogoUploader({ eventId, distanceId, ownLogoUrl, inheritedLogoUrl }: Props) {
  const [own, setOwn] = useState<string | null>(ownLogoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const effective = own ?? inheritedLogoUrl;
  const base = `/api/promoter/events/${eventId}/distances/${distanceId}/sponsor-logo`;

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(base, { method: "POST", body: form });
      const json = (await res.json()) as { ok: boolean; error?: string; logo_url?: string };
      if (!json.ok) {
        setError(json.error ?? "Upload failed.");
        return;
      }
      setOwn(json.logo_url ?? null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(base, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Could not remove the logo.");
        return;
      }
      setOwn(null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
      <p className="font-display text-base font-semibold text-[#1E3A5F]">
        Results sponsor logo{" "}
        <span className="font-sans text-sm font-normal text-[#1E3A5F]/55">(optional)</span>
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[#1E3A5F]/70">
        Shows as &ldquo;PR Results powered by&rdquo; on the share graphics racers post to social
        media. Upload once and every distance in this event uses it automatically; upload here
        again to use a different sponsor for this distance. Use a{" "}
        <strong className="font-semibold">transparent PNG or SVG</strong> — no white boxes.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {effective ? (
          // Checkerboard behind the preview so transparency is obvious.
          <span
            className="inline-flex h-16 items-center rounded-md px-3 ring-1 ring-[#1E3A5F]/15"
            style={{
              backgroundImage:
                "linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%),linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 8px 8px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={effective} alt="Sponsor logo" className="max-h-12 max-w-[180px] object-contain" />
          </span>
        ) : (
          <span className="text-sm text-[#1E3A5F]/50">No sponsor logo yet.</span>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/svg+xml,image/webp,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-md bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E3A5F]/90 disabled:opacity-50"
        >
          {busy ? "Working…" : own ? "Replace logo" : effective ? "Use a different logo here" : "Upload logo"}
        </button>
        {own ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
      </div>

      {!own && inheritedLogoUrl ? (
        <p className="mt-2 text-xs text-[#1E3A5F]/55">
          Currently inheriting the logo uploaded on another distance of this event.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
