"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildCaption,
  renderShareCard,
  type ShareAspect,
  type ShareCardData,
} from "@/lib/share/share-card";

/**
 * Racer share studio: pick/take a photo (or go with the branded no-photo
 * card), preview in Story (9:16) or Feed (4:5), then download or hand off to
 * the phone's native share sheet. Caption is pre-written and copyable.
 */

type Props = {
  data: ShareCardData;
  /** Base for the downloaded filename, e.g. "black-hills-100-finish". */
  fileBase: string;
};

export function ShareCardStudio({ data, fileBase }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [aspect, setAspect] = useState<ShareAspect>("9:16");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const caption = buildCaption(data);

  useEffect(() => {
    setCanNativeShare(
      typeof navigator !== "undefined" &&
        !!navigator.canShare &&
        navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] }),
    );
  }, []);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    setError(null);
    try {
      await renderShareCard(canvas, data, photo, aspect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not render the graphic.");
    } finally {
      setBusy(false);
    }
  }, [data, photo, aspect]);

  useEffect(() => {
    void draw();
  }, [draw]);

  const onPickPhoto = (file: File | undefined | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setPhoto(img);
    img.onerror = () => setError("Could not read that photo — try another one.");
    img.src = url;
  };

  const toBlob = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      canvasRef.current?.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not export the image."))),
        "image/jpeg",
        0.92,
      );
    });

  const download = async () => {
    try {
      const blob = await toBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${fileBase}-${aspect === "9:16" ? "story" : "feed"}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    }
  };

  const nativeShare = async () => {
    try {
      const blob = await toBlob();
      const file = new File([blob], `${fileBase}.jpg`, { type: "image/jpeg" });
      await navigator.share({ files: [file], text: caption });
    } catch {
      // User cancelled the share sheet — not an error.
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — long-press the caption to copy it manually.");
    }
  };

  return (
    <div className="rounded-2xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold text-[#1E3A5F]">
            {data.kind === "finish" ? "Share your finish" : "Share your race day"}
          </p>
          <p className="mt-0.5 text-sm text-[#1E3A5F]/65">
            Add a photo (or go with the Peer Racing card), download, and post it.
          </p>
        </div>
        <div className="flex rounded-lg border border-[#1E3A5F]/15 p-0.5">
          {(["9:16", "4:5"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAspect(a)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                aspect === a ? "bg-[#1E3A5F] text-white" : "text-[#1E3A5F]/65 hover:text-[#1E3A5F]"
              }`}
            >
              {a === "9:16" ? "Story 9:16" : "Feed 4:5"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        {/* Preview */}
        <div
          className="relative w-full max-w-[280px] shrink-0 overflow-hidden rounded-xl bg-[#002F48] shadow-md"
          style={{ aspectRatio: aspect === "9:16" ? "9/16" : "4/5" }}
        >
          <canvas ref={canvasRef} className="h-full w-full" />
          {busy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-sm font-semibold text-white">
              Rendering…
            </div>
          ) : null}
        </div>

        {/* Controls */}
        <div className="w-full space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onPickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md bg-[#1E3A5F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1E3A5F]/90"
            >
              {photo ? "Retake / change photo" : "Add a photo"}
            </button>
            {photo ? (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="rounded-md border border-[#1E3A5F]/20 px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
              >
                Use PR card instead
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void download()}
              disabled={busy}
              className="rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-50"
            >
              Download image
            </button>
            {canNativeShare ? (
              <button
                type="button"
                onClick={() => void nativeShare()}
                disabled={busy}
                className="rounded-md border-2 border-[#E87722] px-5 py-2.5 text-sm font-semibold text-[#E87722] hover:bg-[#E87722]/10 disabled:opacity-50"
              >
                Share…
              </button>
            ) : null}
          </div>

          <div className="rounded-lg border border-[#1E3A5F]/10 bg-[#fafbfc] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                Caption (ready to paste)
              </p>
              <button
                type="button"
                onClick={() => void copyCaption()}
                className="text-xs font-semibold text-[#E87722] hover:underline"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-[#1E3A5F]/80">{caption}</p>
          </div>

          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
