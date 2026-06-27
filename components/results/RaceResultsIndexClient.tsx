"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  formatRaceMonthLabel,
  matchesRaceResultsQuery,
  type RaceResultsIndexCard,
} from "@/lib/race-results-index";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";

function monthOptions(cards: RaceResultsIndexCard[]): { value: string; label: string }[] {
  const keys = new Set<string>();
  for (const card of cards) {
    if (card.raceMonth) keys.add(card.raceMonth);
  }
  return [...keys]
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: formatRaceMonthLabel(value) }));
}

export function RaceResultsIndexClient({ cards }: { cards: RaceResultsIndexCard[] }) {
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");

  const months = useMemo(() => monthOptions(cards), [cards]);

  const filtered = useMemo(() => {
    return cards.filter((card) => {
      if (month && card.raceMonth !== month) return false;
      return matchesRaceResultsQuery(card, query);
    });
  }, [cards, month, query]);

  const hasFilters = Boolean(query.trim() || month);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 py-16 text-center">
        <svg className="h-12 w-12 text-[#1E3A5F]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0H5a2 2 0 01-2-2V7a2 2 0 012-2h2m10 14h2a2 2 0 002-2V7a2 2 0 00-2-2h-2"
          />
        </svg>
        <h2 className="mt-4 font-display text-lg font-semibold text-[#1E3A5F]">No Results Yet</h2>
        <p className="mt-2 max-w-sm text-sm text-[#1E3A5F]/60">
          Results appear here as soon as a race is scored and published.{" "}
          <Link href={DEFAULT_PUBLIC_ROUTE} className="font-medium text-[#E87722] hover:underline">
            Find a race
          </Link>{" "}
          to get in the next one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="results-search" className="text-sm font-medium text-[#1E3A5F]">
              Search
            </label>
            <input
              id="results-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Race name, city, state, distance…"
              className="mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-base text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
            />
          </div>
          <div className="w-full sm:w-48">
            <label htmlFor="results-month" className="text-sm font-medium text-[#1E3A5F]">
              Month
            </label>
            <select
              id="results-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-base text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
            >
              <option value="">All months</option>
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-3 text-sm text-[#1E3A5F]/60">
          {hasFilters ? (
            <>
              Showing <span className="font-semibold text-[#1E3A5F]">{filtered.length}</span> of{" "}
              {cards.length} {cards.length === 1 ? "race" : "races"}
            </>
          ) : (
            <>
              {cards.length} {cards.length === 1 ? "race" : "races"} with results or pending scoring
            </>
          )}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[#1E3A5F]/10 bg-white px-5 py-12 text-center">
          <p className="font-display text-lg font-semibold text-[#1E3A5F]">No matching races</p>
          <p className="mt-2 text-sm text-[#1E3A5F]/60">
            Try a different keyword or clear the month filter.
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setMonth("");
              }}
              className="mt-4 text-sm font-semibold text-[#E87722] hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((card) => {
            const location = [card.city, card.state].filter(Boolean).join(", ");
            return (
              <li
                key={card.eventId}
                className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <Link
                    href={`/events/${card.eventId}`}
                    className="font-display text-xl font-semibold text-[#1E3A5F] transition-colors hover:text-[#E87722]"
                  >
                    {card.eventName}
                  </Link>
                  <p className="text-sm text-[#1E3A5F]/60">
                    {[formatCalendarDate(card.raceDate), location].filter(Boolean).join(" · ")}
                  </p>
                </div>

                {card.awaitingOnly ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                    Race complete — results not submitted yet
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {card.published.map((d) => (
                    <Link
                      key={d.id}
                      href={`/events/${card.eventId}/results/${d.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6m-6 0H5a2 2 0 01-2-2V7a2 2 0 012-2h2m10 14h2a2 2 0 002-2V7a2 2 0 00-2-2h-2m-6 0V3h6v2m-6 0h6"
                        />
                      </svg>
                      {d.label ?? "Results"}
                    </Link>
                  ))}
                  {!card.awaitingOnly
                    ? card.awaiting.map((d) => (
                        <span
                          key={d.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900"
                          title="Results have not been submitted for this distance yet"
                        >
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                          {d.label ?? "Distance"} · pending
                        </span>
                      ))
                    : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
