"use client";

import { useMemo, useState } from "react";

export type BulkImportEventOption = {
  id: string;
  name: string;
  race_date: string;
  city: string | null;
  state: string | null;
  distances: { id: string; label: string; sort_order: number | null }[];
};

type ApiSummary = {
  rowsTotal: number;
  rowsValid: number;
  rowsRejected: number;
  usersCreated: number;
  profilesUpserted: number;
  membershipsUpserted: number;
  entriesInserted: number;
  entriesSkippedAlreadyRegistered: number;
  entriesSkippedDuplicateInFile: number;
  uniqueRegistrationKeysInFile: number;
  entriesTranspondersUpdated: number;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  hadValidationRejections?: boolean;
  summary?: ApiSummary;
  rowErrors?: Array<{ row: number; message: string }>;
};

function normalizeDistances(raw: unknown): { id: string; label: string; sort_order: number | null }[] {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((d) => {
    const x = d as { id: string; label: string; sort_order?: number | null };
    return {
      id: x.id,
      label: x.label,
      sort_order: x.sort_order ?? null,
    };
  });
}

export function BulkImportClient({
  events,
  audience,
}: {
  events: BulkImportEventOption[];
  audience: "admin" | "promoter";
}) {
  const [eventId, setEventId] = useState("");
  const [defaultDistanceId, setDefaultDistanceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const selected = useMemo(
    () => events.find((e) => e.id === eventId),
    [events, eventId],
  );

  const distances = useMemo(() => {
    const d = selected ? normalizeDistances(selected.distances) : [];
    return [...d].sort((a, b) => {
      const ao = a.sort_order ?? 999;
      const bo = b.sort_order ?? 999;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label);
    });
  }, [selected]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    if (!file || !eventId) return;

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("event_id", eventId);
      if (defaultDistanceId) fd.append("default_distance_id", defaultDistanceId);
      fd.append("file", file);

      const res = await fetch("/api/bulk-import", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as ApiResponse & { error?: string };
      if (!res.ok) {
        setResult({
          ok: false,
          error: typeof json.error === "string" ? json.error : `Error ${res.status}`,
        });
        return;
      }
      setResult(json);
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
        {audience === "admin" ? "Admin" : "Promoter"}
      </p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
        Bulk Entry Import
      </h1>
      <p className="mt-3 text-pretty text-[#1E3A5F]/75">
        Upload a CSV to create or match accounts (by email), ensure active membership, and add
        entries for <strong>one event</strong> at a time. Processing uses batched database writes
        (not one request per character).
      </p>

      <div className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-5 text-sm text-[#1E3A5F]/85 shadow-sm sm:p-6">
        <h2 className="font-display text-base font-semibold text-[#1E3A5F]">CSV format</h2>
        <p className="mt-2">
          Required columns: <code className="rounded bg-[#1E3A5F]/10 px-1">email</code>,{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">first_name</code>,{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">last_name</code>,{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">phone</code> (10+ digits),{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">sex</code> (M/F or male/female),{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">dob</code> (YYYY-MM-DD).
        </p>
        <p className="mt-2">
          Optional: <code className="rounded bg-[#1E3A5F]/10 px-1">distance_id</code> (UUID from your
          database), <code className="rounded bg-[#1E3A5F]/10 px-1">bib</code>,{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">event_id</code> (must match the event you
          select — or omit it),{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">military</code> (y/n or yes/no for active or
          retired military; defaults to no),{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">transponder_1</code> /{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">transponder_2</code> (or{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">Transponder1</code> /{" "}
          <code className="rounded bg-[#1E3A5F]/10 px-1">Transponder2</code>) for Race Result RFID
          handoff — stored on new inserts and applied to existing entries when email + distance
          match.
        </p>
        <p className="mt-2 text-[#1E3A5F]/70">
          If every row uses the same distance, pick a <strong>default distance</strong> below and
          you can omit <code className="rounded bg-[#1E3A5F]/10 px-1">distance_id</code> in the
          file.
        </p>
      </div>

      {events.length === 0 ? (
        <p className="mt-8 text-sm text-[#1E3A5F]/70">
          No events available. Create an event first, then return here.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          <div>
            <label htmlFor="bulk-event" className="text-sm font-medium text-[#1E3A5F]">
              Event
            </label>
            <select
              id="bulk-event"
              required
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                setDefaultDistanceId("");
              }}
              className="mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
            >
              <option value="">Select an event</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} — {ev.race_date}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bulk-default-dist" className="text-sm font-medium text-[#1E3A5F]">
              Default distance (optional)
            </label>
            <select
              id="bulk-default-dist"
              value={defaultDistanceId}
              onChange={(e) => setDefaultDistanceId(e.target.value)}
              disabled={!eventId}
              className="mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25 disabled:opacity-50"
            >
              <option value="">— Use per-row distance_id in CSV —</option>
              {distances.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="bulk-file" className="text-sm font-medium text-[#1E3A5F]">
              CSV file
            </label>
            <input
              id="bulk-file"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-[#1E3A5F] file:mr-4 file:rounded-md file:border-0 file:bg-[#E87722] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#E87722]/90"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !eventId || !file}
            className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Importing…" : "Run import"}
          </button>
        </form>
      )}

      {result?.error ? (
        <div
          className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {result.error}
        </div>
      ) : null}

      {result?.summary ? (
        <div
          className={`mt-8 rounded-xl border px-5 py-4 shadow-sm ${
            result.ok && !result.hadValidationRejections && result.summary.entriesInserted > 0
              ? "border-emerald-200 bg-emerald-50/90"
              : result.ok && !result.hadValidationRejections
                ? "border-amber-200 bg-amber-50/90"
              : result.ok
                ? "border-amber-200 bg-amber-50/90"
                : "border-red-200 bg-red-50/90"
          }`}
        >
          <p className="font-display font-semibold text-[#1E3A5F]">
            {result.ok && !result.hadValidationRejections && result.summary.entriesInserted > 0
              ? "Import finished successfully"
              : result.ok && !result.hadValidationRejections
                ? "Import finished — no new entries added"
              : result.ok
                ? "Import finished with some rejected rows"
                : "Import finished with errors"}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-[#1E3A5F]/90">
            <li>Rows in file: {result.summary.rowsTotal}</li>
            <li>Valid rows processed: {result.summary.rowsValid}</li>
            <li>Rows rejected in validation: {result.summary.rowsRejected}</li>
            <li>New auth users created: {result.summary.usersCreated}</li>
            <li>Profiles updated: {result.summary.profilesUpserted}</li>
            <li>Memberships updated: {result.summary.membershipsUpserted}</li>
            <li>Entries inserted: {result.summary.entriesInserted}</li>
            <li>
              Distinct runner + distance pairs in file: {result.summary.uniqueRegistrationKeysInFile}
            </li>
            <li>
              Skipped (already in database for this event):{" "}
              {result.summary.entriesSkippedAlreadyRegistered}
            </li>
            <li>
              Skipped (duplicate lines in this file): {result.summary.entriesSkippedDuplicateInFile}
            </li>
            <li>
              Transponder fields updated (existing entries, RR CSV):{" "}
              {result.summary.entriesTranspondersUpdated}
            </li>
          </ul>
          {result.summary.entriesInserted === 0 &&
          result.summary.rowsValid > 0 &&
          (result.summary.entriesSkippedAlreadyRegistered > 0 ||
            result.summary.entriesSkippedDuplicateInFile > 0) ? (
            <p className="mt-3 text-sm text-[#1E3A5F]/85">
              No new entries were added because every row matched an existing registration or repeated
              the same runner and distance. If you expected many new entrants, check that emails and
              distances in the CSV are correct, that you selected the right event, and that the file
              is not mostly duplicate rows.
            </p>
          ) : null}
        </div>
      ) : null}

      {result?.rowErrors && result.rowErrors.length > 0 ? (
        <div className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-white p-4 shadow-sm">
          <h3 className="font-display text-sm font-semibold text-[#1E3A5F]">
            Row Messages ({result.rowErrors.length})
          </h3>
          <ul className="mt-2 max-h-64 overflow-y-auto text-xs text-[#1E3A5F]/80">
            {result.rowErrors.slice(0, 80).map((err, i) => (
              <li key={`${err.row}-${i}`}>
                {err.row ? `Row ${err.row}: ` : ""}
                {err.message}
              </li>
            ))}
            {result.rowErrors.length > 80 ? (
              <li className="text-[#1E3A5F]/55">…and {result.rowErrors.length - 80} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
