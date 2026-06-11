"use client";

/**
 * Finish-time import (results pipeline, step 2). Producer uploads the timing CSV,
 * rows auto-match to entries by race-day bib / PR ID / lifetime bib / unique name,
 * and anything left over gets a manual review here before the console runs the
 * algorithm on matched rows.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type DistanceOption = { id: string; label: string };

type ParsedFields = {
  row_num: number;
  bib: string | null;
  pr_id: string | null;
  first_name: string | null;
  last_name: string | null;
  time_ms: number | null;
  time_display: string | null;
  match_method: string | null;
  note: string | null;
};

type RawRow = {
  id: string;
  row_json: { raw: Record<string, unknown>; parsed: ParsedFields };
  match_status: "matched" | "unmatched" | "ignored";
  matched_entry_id: string | null;
  source_filename: string | null;
  imported_at: string;
};

type EntryOption = {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  bib: string | null;
  assigned_bib: string | null;
  pr_id: string | null;
};

type Summary = { total: number; matched: number; unmatched: number; ignored: number };

const METHOD_LABELS: Record<string, string> = {
  assigned_bib: "race bib",
  pr_id: "PR ID",
  bib: "bib",
  name: "name",
  manual: "manual",
};

function entryLabel(e: EntryOption): string {
  const ids = [e.assigned_bib && `bib ${e.assigned_bib}`, e.pr_id && `PR ${e.pr_id}`]
    .filter(Boolean)
    .join(" · ");
  return `${e.last_name}, ${e.first_name}${ids ? ` — ${ids}` : ""}`;
}

function rowWho(p: ParsedFields): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const ids = [p.bib && `bib ${p.bib}`, p.pr_id && `PR ${p.pr_id}`].filter(Boolean).join(" · ");
  if (name && ids) return `${name} (${ids})`;
  return name || ids || `file row ${p.row_num}`;
}

export function ResultsImportClient({
  eventId,
  distances,
}: {
  eventId: string;
  distances: DistanceOption[];
}) {
  const [distanceId, setDistanceId] = useState(distances[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [entries, setEntries] = useState<EntryOption[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<Record<string, string>>({});

  const apiBase = `/api/promoter/events/${eventId}/results-import`;

  const refresh = useCallback(async () => {
    if (!distanceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}?distanceId=${encodeURIComponent(distanceId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        rows?: RawRow[];
        entries?: EntryOption[];
        summary?: Summary;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}`);
        setRows([]);
        setEntries([]);
        setSummary(null);
        return;
      }
      setRows(json.rows ?? []);
      setEntries(json.entries ?? []);
      setSummary(json.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [apiBase, distanceId]);

  useEffect(() => {
    setRows([]);
    setSummary(null);
    setNotice(null);
    setPendingMatch({});
    void refresh();
  }, [refresh]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !distanceId) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("distance_id", distanceId);
      fd.append("file", file);
      const res = await fetch(apiBase, { method: "POST", body: fd });
      const json = (await res.json()) as { ok: boolean; error?: string; summary?: Summary };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}`);
        return;
      }
      const s = json.summary;
      setNotice(
        s
          ? `Imported ${s.total} rows — ${s.matched} matched automatically, ${s.unmatched} need review.`
          : "Import finished.",
      );
      setFile(null);
      setFileKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function patchRow(rawId: string, action: "match" | "ignore" | "unmatch", entryId?: string) {
    setError(null);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_id: rawId, action, entry_id: entryId }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}`);
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }

  const matchedEntryIds = useMemo(
    () => new Set(rows.map((r) => r.matched_entry_id).filter(Boolean) as string[]),
    [rows],
  );
  const availableEntries = useMemo(
    () =>
      [...entries]
        .filter((e) => !matchedEntryIds.has(e.id))
        .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)),
    [entries, matchedEntryIds],
  );
  const entriesById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const unmatchedRows = rows.filter((r) => r.match_status === "unmatched");
  const matchedRows = rows.filter((r) => r.match_status === "matched");
  const ignoredRows = rows.filter((r) => r.match_status === "ignored");
  const sourceFilename = rows[0]?.source_filename ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="ri-distance" className="text-sm font-medium text-[#1E3A5F]">
            Distance
          </label>
          <select
            id="ri-distance"
            value={distanceId}
            onChange={(e) => setDistanceId(e.target.value)}
            className="mt-1.5 block rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
          >
            {distances.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={onUpload} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="ri-file" className="text-sm font-medium text-[#1E3A5F]">
              Timing CSV
            </label>
            <input
              id="ri-file"
              key={fileKey}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-[#1E3A5F] file:mr-4 file:rounded-md file:border-0 file:bg-[#E87722] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#E87722]/90"
            />
          </div>
          <button
            type="submit"
            disabled={uploading || !file || !distanceId}
            className="inline-flex items-center justify-center rounded-md bg-[#1E3A5F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1E3A5F]/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? "Importing…" : "Import finish times"}
          </button>
        </form>
      </div>

      <p className="max-w-2xl text-xs leading-relaxed text-[#1E3A5F]/60">
        Needs a time column (Chip Time, Net Time, Finish Time, or Time) plus a bib, PR ID, or name
        column. Rows auto-match to this distance&apos;s entries by race-day bib, then PR ID, then
        lifetime bib, then unique full name. Re-importing replaces the previous file for this
        distance.
      </p>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#1E3A5F]/60">Loading…</p>
      ) : summary && summary.total > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {sourceFilename ? (
              <span className="rounded-full border border-[#1E3A5F]/15 bg-white px-3 py-1 text-xs font-medium text-[#1E3A5F]/75">
                {sourceFilename}
              </span>
            ) : null}
            <span className="rounded-full bg-[#1E3A5F]/10 px-3 py-1 text-xs font-semibold text-[#1E3A5F]">
              {summary.total} rows
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              {summary.matched} matched
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                summary.unmatched > 0 ? "bg-amber-100 text-amber-800" : "bg-[#1E3A5F]/5 text-[#1E3A5F]/50"
              }`}
            >
              {summary.unmatched} need review
            </span>
            {summary.ignored > 0 ? (
              <span className="rounded-full bg-[#1E3A5F]/5 px-3 py-1 text-xs font-semibold text-[#1E3A5F]/60">
                {summary.ignored} ignored
              </span>
            ) : null}
          </div>

          {unmatchedRows.length > 0 ? (
            <section>
              <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">
                Needs review ({unmatchedRows.length})
              </h2>
              <p className="mt-1 text-sm text-[#1E3A5F]/70">
                Match each row to a registered runner, or ignore it (pacers, unregistered runners,
                bad rows).
              </p>
              <div className="mt-4 space-y-3">
                {unmatchedRows.map((r) => {
                  const p = r.row_json.parsed;
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1E3A5F]">{rowWho(p)}</p>
                        <p className="mt-0.5 text-xs text-[#1E3A5F]/70">
                          {p.time_display ? `Finish ${p.time_display}` : "No finish time"}
                          {p.note ? ` — ${p.note}` : ""}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
                        {p.time_ms !== null ? (
                          <>
                            <select
                              value={pendingMatch[r.id] ?? ""}
                              onChange={(e) =>
                                setPendingMatch((m) => ({ ...m, [r.id]: e.target.value }))
                              }
                              className="rounded-lg border border-[#1E3A5F]/20 bg-white px-2.5 py-2 text-xs text-[#1E3A5F] focus:border-[#E87722] focus:outline-none"
                            >
                              <option value="">Select runner…</option>
                              {availableEntries.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {entryLabel(e)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!pendingMatch[r.id]}
                              onClick={() => void patchRow(r.id, "match", pendingMatch[r.id])}
                              className="rounded-md bg-[#E87722] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Match
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void patchRow(r.id, "ignore")}
                          className="rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-xs font-semibold text-[#1E3A5F]/70 transition-colors hover:bg-[#1E3A5F]/5"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
              Every imported row is matched or ignored. This distance is ready for the results
              console.
            </div>
          )}

          {matchedRows.length > 0 ? (
            <section>
              <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">
                Matched ({matchedRows.length})
              </h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#1E3A5F]/10 text-xs uppercase tracking-wide text-[#1E3A5F]/55">
                      <th className="px-4 py-2.5 font-semibold">Finish</th>
                      <th className="px-4 py-2.5 font-semibold">CSV row</th>
                      <th className="px-4 py-2.5 font-semibold">Matched runner</th>
                      <th className="px-4 py-2.5 font-semibold">Via</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...matchedRows]
                      .sort(
                        (a, b) =>
                          (a.row_json.parsed.time_ms ?? Infinity) -
                          (b.row_json.parsed.time_ms ?? Infinity),
                      )
                      .map((r) => {
                        const p = r.row_json.parsed;
                        const entry = r.matched_entry_id
                          ? entriesById.get(r.matched_entry_id)
                          : undefined;
                        return (
                          <tr key={r.id} className="border-b border-[#1E3A5F]/5 last:border-0">
                            <td className="px-4 py-2 font-mono text-[#1E3A5F]">
                              {p.time_display ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-[#1E3A5F]/80">{rowWho(p)}</td>
                            <td className="px-4 py-2 text-[#1E3A5F]">
                              {entry ? `${entry.first_name} ${entry.last_name}` : "—"}
                            </td>
                            <td className="px-4 py-2">
                              <span className="rounded-full bg-[#1E3A5F]/8 px-2 py-0.5 text-xs text-[#1E3A5F]/70">
                                {METHOD_LABELS[p.match_method ?? ""] ?? "manual"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => void patchRow(r.id, "unmatch")}
                                className="text-xs font-semibold text-[#1E3A5F]/55 transition-colors hover:text-red-700"
                              >
                                Unmatch
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {ignoredRows.length > 0 ? (
            <section>
              <h2 className="font-display text-lg font-semibold text-[#1E3A5F]/70">
                Ignored ({ignoredRows.length})
              </h2>
              <div className="mt-3 space-y-2">
                {ignoredRows.map((r) => {
                  const p = r.row_json.parsed;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-[#1E3A5F]/10 bg-white px-4 py-2.5 text-sm text-[#1E3A5F]/60"
                    >
                      <span>
                        {rowWho(p)}
                        {p.time_display ? ` — ${p.time_display}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => void patchRow(r.id, "unmatch")}
                        className="text-xs font-semibold text-[#1E3A5F]/55 transition-colors hover:text-[#E87722]"
                      >
                        Restore
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-[#1E3A5F]/60">
          No finish times imported for this distance yet. Upload the timing CSV above.
        </p>
      )}
    </div>
  );
}
