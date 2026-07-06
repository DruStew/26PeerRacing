"use client";

import { useMemo, useState } from "react";

type DistanceOption = { id: string; label: string; sort_order: number | null };

type ImportSummary = {
  rowsTotal: number;
  rowsValid: number;
  rowsRejected: number;
  entriesInserted: number;
  entriesSkippedAlreadyRegistered: number;
  entriesSkippedDuplicateInFile: number;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  summary?: ImportSummary;
  rowErrors?: Array<{ row: number; message: string }>;
};

export function DemoParticipantsImportClient({
  eventId,
  eventName,
  distances,
}: {
  eventId: string;
  eventName: string;
  distances: DistanceOption[];
}) {
  const [defaultDistanceId, setDefaultDistanceId] = useState(distances[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const sortedDistances = useMemo(
    () =>
      [...distances].sort((a, b) => {
        const ao = a.sort_order ?? 999;
        const bo = b.sort_order ?? 999;
        if (ao !== bo) return ao - bo;
        return a.label.localeCompare(b.label);
      }),
    [distances],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (defaultDistanceId) form.set("default_distance_id", defaultDistanceId);
      const res = await fetch(`/api/admin/demo-events/${eventId}/import`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as ApiResponse;
      setResult(json);
    } catch {
      setResult({ ok: false, error: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">Demo import</p>
        <h1 className="font-display mt-2 text-2xl font-bold text-[#1E3A5F]">Participants — {eventName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#1E3A5F]/75">
          Creates roster entries only — no auth accounts, memberships, or emails to real people. Required:{" "}
          <span className="font-mono text-xs">first_name, last_name</span>. Optional:{" "}
          <span className="font-mono text-xs">bib, sex, dob, distance_id, transponder_1, transponder_2</span>.
        </p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
        {sortedDistances.length > 1 ? (
          <label className="block text-sm font-medium text-[#1E3A5F]">
            Default distance (when CSV has no distance_id)
            <select
              value={defaultDistanceId}
              onChange={(e) => setDefaultDistanceId(e.target.value)}
              className="mt-1.5 w-full max-w-md rounded-lg border border-[#1E3A5F]/20 px-3 py-2 text-sm"
            >
              {sortedDistances.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="mt-4 block text-sm font-medium text-[#1E3A5F]">
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1.5 block w-full text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={!file || loading || sortedDistances.length === 0}
          className="mt-5 rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-50"
        >
          {loading ? "Importing…" : "Import demo participants"}
        </button>
      </form>

      {result ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {result.ok && result.summary ? (
            <>
              <p className="font-semibold">Import complete</p>
              <ul className="mt-2 list-inside list-disc">
                <li>{result.summary.entriesInserted} entries inserted</li>
                <li>{result.summary.entriesSkippedAlreadyRegistered} skipped (already registered)</li>
                <li>{result.summary.entriesSkippedDuplicateInFile} skipped (duplicate in file)</li>
              </ul>
            </>
          ) : (
            <p>{result.error ?? "Import failed"}</p>
          )}
          {result.rowErrors?.length ? (
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs">
              {result.rowErrors.slice(0, 20).map((err) => (
                <li key={`${err.row}-${err.message}`}>
                  Row {err.row}: {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
