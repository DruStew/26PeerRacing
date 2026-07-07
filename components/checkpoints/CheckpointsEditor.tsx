"use client";

import { useRef, useState } from "react";

/**
 * Distance editor section: QR trail checkpoints. Promoters add checkpoints,
 * optionally attach an audio story, then download print-ready SVG/PNG signs.
 */

type Checkpoint = {
  id: string | null;
  name: string;
  mile_marker: string;
  audio_url: string | null;
  scan_url: string | null;
};

type Props = {
  eventId: string;
  distanceId: string;
  initial: Array<{
    id: string;
    name: string;
    mile_marker: string | null;
    audio_url: string | null;
    scan_url: string;
  }>;
  inputClass: string;
};

export function CheckpointsEditor({ eventId, distanceId, initial, inputClass }: Props) {
  const [items, setItems] = useState<Checkpoint[]>(
    initial.map((c) => ({
      id: c.id,
      name: c.name,
      mile_marker: c.mile_marker ?? "",
      audio_url: c.audio_url,
      scan_url: c.scan_url,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioBusy, setAudioBusy] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const base = `/api/promoter/events/${eventId}/distances/${distanceId}/checkpoints`;

  const update = (idx: number, patch: Partial<Checkpoint>) => {
    setItems((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
    setDirty(true);
    setMessage(null);
  };

  const addCheckpoint = () => {
    setItems((prev) => [
      ...prev,
      { id: null, name: "", mile_marker: "", audio_url: null, scan_url: null },
    ]);
    setDirty(true);
    setMessage(null);
  };

  const removeCheckpoint = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkpoints: items.map((c) => ({ id: c.id, name: c.name, mile_marker: c.mile_marker })),
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        checkpoints?: Array<{
          id: string;
          name: string;
          mile_marker: string | null;
          audio_url: string | null;
          scan_url: string;
        }>;
      };
      if (!json.ok || !json.checkpoints) {
        setError(json.error ?? "Could not save checkpoints.");
        return;
      }
      setItems(
        json.checkpoints.map((c) => ({
          id: c.id,
          name: c.name,
          mile_marker: c.mile_marker ?? "",
          audio_url: c.audio_url,
          scan_url: c.scan_url,
        })),
      );
      setDirty(false);
      setMessage("Checkpoints saved — QR signs are ready to download.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const uploadAudio = async (checkpointId: string, file: File) => {
    setAudioBusy(checkpointId);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${base}/${checkpointId}/audio`, { method: "POST", body: form });
      const json = (await res.json()) as { ok: boolean; error?: string; audio_url?: string };
      if (!json.ok) {
        setError(json.error ?? "Audio upload failed.");
        return;
      }
      setItems((prev) =>
        prev.map((c) => (c.id === checkpointId ? { ...c, audio_url: json.audio_url ?? null } : c)),
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setAudioBusy(null);
    }
  };

  const removeAudio = async (checkpointId: string) => {
    setAudioBusy(checkpointId);
    setError(null);
    try {
      const res = await fetch(`${base}/${checkpointId}/audio`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Could not remove audio.");
        return;
      }
      setItems((prev) => prev.map((c) => (c.id === checkpointId ? { ...c, audio_url: null } : c)));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setAudioBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
      <p className="font-display text-base font-semibold text-[#1E3A5F]">QR Trail Checkpoints</p>
      <p className="mt-2 text-sm leading-relaxed text-[#1E3A5F]/70">
        Print QR signs and post them along the course. Runners scan with their phone camera — each
        scan pings the live board, and can play an audio story you record for that spot. Download
        the print-ready sign (SVG is true vector for your graphics person; PNG prints up to ~10
        inches).
      </p>

      <div className="mt-4 space-y-4">
        {items.map((cp, idx) => (
          <div key={cp.id ?? `new-${idx}`} className="rounded-lg border border-[#1E3A5F]/10 bg-[#fafbfc] p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-[#1E3A5F]">Checkpoint {idx + 1}</p>
              <button
                type="button"
                onClick={() => removeCheckpoint(idx)}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px]">
              <div>
                <label className="text-xs font-medium text-[#1E3A5F]/70">Name</label>
                <input
                  value={cp.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  placeholder="Dalton Summit"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#1E3A5F]/70">Mile (optional)</label>
                <input
                  value={cp.mile_marker}
                  onChange={(e) => update(idx, { mile_marker: e.target.value })}
                  placeholder="42"
                  className={inputClass}
                />
              </div>
            </div>

            {cp.id ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a
                  href={`${base}/${cp.id}/download?format=svg`}
                  className="rounded-md bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A5F]/90"
                >
                  Download SVG (vector)
                </a>
                <a
                  href={`${base}/${cp.id}/download?format=png`}
                  className="rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
                >
                  Download PNG
                </a>

                {cp.audio_url ? (
                  <span className="inline-flex items-center gap-2">
                    <audio src={cp.audio_url} controls preload="none" className="h-8 max-w-[220px]" />
                    <button
                      type="button"
                      disabled={audioBusy === cp.id}
                      onClick={() => cp.id && void removeAudio(cp.id)}
                      className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                    >
                      Remove audio
                    </button>
                  </span>
                ) : (
                  <>
                    <input
                      ref={(el) => {
                        if (cp.id) fileInputs.current[cp.id] = el;
                      }}
                      type="file"
                      accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && cp.id) void uploadAudio(cp.id, f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={audioBusy === cp.id}
                      onClick={() => cp.id && fileInputs.current[cp.id]?.click()}
                      className="rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722] disabled:opacity-50"
                    >
                      {audioBusy === cp.id ? "Uploading…" : "Add audio story (MP3)"}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-[#1E3A5F]/55">
                Save checkpoints to generate this sign&apos;s QR code and enable audio upload.
              </p>
            )}

            {cp.scan_url ? (
              <p className="mt-2 break-all text-[11px] text-[#1E3A5F]/45">Scan URL: {cp.scan_url}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addCheckpoint}
          className="rounded-md border border-dashed border-[#1E3A5F]/30 px-4 py-2 text-sm font-semibold text-[#1E3A5F]/75 hover:border-[#E87722] hover:text-[#E87722]"
        >
          + Add checkpoint
        </button>
        {(dirty || items.some((c) => !c.id)) && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || items.some((c) => !c.name.trim())}
            className="rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save checkpoints"}
          </button>
        )}
        {message ? <span className="text-sm font-medium text-emerald-700">{message}</span> : null}
        {error ? <span className="text-sm font-medium text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
