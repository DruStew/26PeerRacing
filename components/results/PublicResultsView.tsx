import { DivisionBadge, DIVISION_COLORS } from "@/components/results/DivisionBadge";
import { formatFinishTime, formatUsd } from "@/lib/results-racer";
import type { PublicResults } from "@/lib/results-public";

/** H:MM:SS axis label from a fractional-hours value. */
function fmtHoursLabel(h: number): string {
  return formatFinishTime(Math.round(h * 3_600_000));
}

/**
 * Read-only, public mirror of the producer results console — standings, division
 * badges, and money paid. No percentile controls, publish buttons, imports, or
 * internal holdings: just the official, transparent results.
 */
export function PublicResultsView({ results }: { results: PublicResults }) {
  const r = results;

  return (
    <div className="space-y-8">
      {/* summary */}
      <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">Racers</p>
            <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">{r.totalFinishers}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">Divisions</p>
            <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">{r.divisions.length}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">Cash awards</p>
            <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">{r.checksPaid}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">Prizes awarded</p>
            <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">{r.prizeAwardCount}</p>
          </div>
          <div className="rounded-lg border border-[#E87722]/30 bg-[#E87722]/5 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#E87722]">
              {r.showTotalAwardValue ? "Cash + prize value" : "Cash payout"}
            </p>
            <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">
              {formatUsd(r.totalPayoutCents + (r.showTotalAwardValue ? r.totalPrizeRetailValueCents : 0))}
            </p>
            {r.showTotalAwardValue && r.totalPrizeRetailValueCents > 0 ? (
              <p className="mt-1 text-[10px] text-[#1E3A5F]/60">Prize portion uses stated retail value.</p>
            ) : null}
          </div>
        </div>

        <PublicTimeline results={r} />
      </section>

      {/* badges in play */}
      {r.divisions.length > 0 || r.incentives.length > 0 ? (
        <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Badges Awarded</h2>
          <p className="mt-1 text-xs text-[#1E3A5F]/65">
            Every finisher earns their division badge; award places can win cash, prizes, or both.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-6">
            {r.divisions.map((d) => (
              <div key={d.division} className="flex flex-col items-center gap-1">
                <DivisionBadge division={d.division} size={76} />
                <span className="text-xs font-medium text-[#1E3A5F]/70">
                  {d.runners.length} {d.runners.length === 1 ? "runner" : "runners"}
                </span>
              </div>
            ))}
            {r.incentives.flatMap((pool) =>
              pool.divisions.map((d) => (
                <div key={`${pool.key}-${d.division}`} className="flex flex-col items-center gap-1">
                  <DivisionBadge division={d.division} variant={pool.key} size={64} />
                  <span className="text-xs font-medium text-[#1E3A5F]/70">
                    {pool.title} · {d.runners.length}
                  </span>
                </div>
              )),
            )}
          </div>
        </section>
      ) : null}

      {/* main divisions */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Peer Team Divisions</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {r.divisions.map((d) => (
            <div key={d.division} className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <DivisionBadge division={d.division} size={56} />
                <div>
                  <p className="font-display text-base font-semibold text-[#1E3A5F]">{d.division}</p>
                  <p className="text-xs text-[#1E3A5F]/60">
                    {fmtHoursLabel(d.minHours)} – {fmtHoursLabel(d.maxHours)} · {d.runners.length} runners
                  </p>
                  {d.paidCents > 0 ? (
                    <p className="text-xs text-[#1E3A5F]/60">Paid {formatUsd(d.paidCents)}</p>
                  ) : null}
                </div>
              </div>
              <RunnerTable
                runners={d.runners}
                payoutOf={(f) => f.payoutCents}
                placeOf={(f) => f.divisionPlace}
                prizeCategory="main"
              />
            </div>
          ))}
        </div>
      </section>

      {/* incentive pools */}
      {r.incentives.map((pool) => (
        <section key={pool.key} className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">{pool.title} Divisions</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {pool.divisions.map((d) => (
              <div key={d.division} className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <DivisionBadge division={d.division} variant={pool.key} size={56} />
                  <div>
                    <p className="font-display text-base font-semibold text-[#1E3A5F]">
                      {d.division} <span className="text-xs font-normal text-[#1E3A5F]/55">({pool.title})</span>
                    </p>
                    <p className="text-xs text-[#1E3A5F]/60">{d.runners.length} runners</p>
                  </div>
                </div>
                <RunnerTable
                  runners={d.runners}
                  payoutOf={(f) =>
                    pool.key === "female" ? f.femaleIncentivePayoutCents : f.militaryIncentivePayoutCents
                  }
                  placeOf={(f) => (pool.key === "female" ? f.femaleIncentivePlace : f.militaryIncentivePlace)}
                  prizeCategory={pool.key}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <FullFinisherList results={r} />
    </div>
  );
}

function RunnerTable({
  runners,
  payoutOf,
  placeOf,
  prizeCategory,
}: {
  runners: PublicResults["finishers"];
  payoutOf: (f: PublicResults["finishers"][number]) => number;
  placeOf: (f: PublicResults["finishers"][number]) => number | null;
  prizeCategory: "main" | "female" | "military";
}) {
  return (
    <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-[#1E3A5F]/10">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#fafbfc] text-left text-xs uppercase tracking-wide text-[#1E3A5F]/55">
          <tr>
            <th className="px-3 py-2 font-semibold">Place</th>
            <th className="px-3 py-2 font-semibold">Bib</th>
            <th className="px-3 py-2 font-semibold">Runner</th>
            <th className="px-3 py-2 text-right font-semibold">Time</th>
            <th className="px-3 py-2 text-right font-semibold">Awards</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E3A5F]/10">
          {runners.map((f, idx) => {
            const amount = payoutOf(f);
            const prizes = f.prizes.filter((prize) => prize.category === prizeCategory);
            return (
              <tr key={f.id} className={amount > 0 || prizes.length > 0 ? "bg-[#fff9f5]" : undefined}>
                <td className="px-3 py-1.5 tabular-nums text-[#1E3A5F]/80">{placeOf(f) ?? idx + 1}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-[#1E3A5F]/70">{f.bib ?? "—"}</td>
                <td className="px-3 py-1.5 text-[#1E3A5F]">
                  {f.firstName} {f.lastName}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-[#1E3A5F]/80">
                  {formatFinishTime(f.finishTimeMs)}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-[#1E3A5F]">
                  {amount > 0 ? <span className="block">{formatUsd(amount)}</span> : null}
                  {prizes.map((prize) => (
                    <span key={prize.id} className="block text-xs font-medium text-[#E87722]">
                      {prize.name}
                      {prize.showRetailValue && prize.retailValueCents > 0
                        ? ` (${formatUsd(prize.retailValueCents)} value)`
                        : ""}
                    </span>
                  ))}
                  {amount <= 0 && prizes.length === 0 ? "—" : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FullFinisherList({ results }: { results: PublicResults }) {
  const r = results;
  const hasIncentives = r.incentives.length > 0;
  return (
    <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Full Finisher List</h2>
      <p className="mt-1 text-xs text-[#1E3A5F]/65">
        Every finisher in overall placing order — {r.totalFinishers} runners. Paid rows highlighted.
      </p>
      <div className="mt-4 max-h-[40rem] overflow-y-auto rounded-lg border border-[#1E3A5F]/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#fafbfc] text-left text-xs uppercase tracking-wide text-[#1E3A5F]/55">
            <tr>
              <th className="px-3 py-2 font-semibold">Place</th>
              <th className="px-3 py-2 font-semibold">Division</th>
              <th className="px-3 py-2 font-semibold">Bib</th>
              <th className="px-3 py-2 font-semibold">Runner</th>
              <th className="px-3 py-2 text-right font-semibold">Time</th>
              <th className="px-3 py-2 text-right font-semibold">Div. place</th>
              <th className="px-3 py-2 text-right font-semibold">Payout</th>
              {hasIncentives ? <th className="px-3 py-2 text-right font-semibold">Incentive</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E3A5F]/10">
            {r.finishers.map((f) => {
              const colors = f.division ? DIVISION_COLORS[f.division] : undefined;
              const incentive = f.femaleIncentivePayoutCents + f.militaryIncentivePayoutCents;
              return (
                <tr key={f.id} className={f.payoutCents > 0 || incentive > 0 ? "bg-[#fff9f5]" : undefined}>
                  <td className="px-3 py-1.5 font-semibold tabular-nums text-[#1E3A5F]">{f.overallRank ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    {f.division ? (
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-white"
                        style={{ backgroundColor: colors?.dark }}
                      >
                        {f.division.toUpperCase()}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-[#1E3A5F]/70">{f.bib ?? "—"}</td>
                  <td className="px-3 py-1.5 text-[#1E3A5F]">
                    {f.firstName} {f.lastName}
                    {f.prizes.length > 0 ? (
                      <span className="mt-0.5 block text-[11px] font-medium text-[#E87722]">
                        {f.prizes.map((prize) => prize.name).join(" · ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-[#1E3A5F]/80">
                    {formatFinishTime(f.finishTimeMs)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[#1E3A5F]/80">
                    {f.division ? `${f.division} ${f.divisionPlace ?? ""}`.trim() : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-[#1E3A5F]">
                    {f.payoutCents > 0 ? formatUsd(f.payoutCents) : "—"}
                  </td>
                  {hasIncentives ? (
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-[#1E3A5F]">
                      {incentive > 0 ? formatUsd(incentive) : "—"}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Visual-only time strip: colored division bands with a dot per finisher. */
function PublicTimeline({ results }: { results: PublicResults }) {
  const r = results;
  if (r.finishers.length === 0) return null;
  const minH = r.minHours;
  const maxH = r.maxHours;
  const span = Math.max(maxH - minH, 0.01);
  const x = (h: number) => 24 + ((h - minH) / span) * 752;

  const bands = r.divisions.map((d) => {
    const widthPct = ((d.maxHours - d.minHours) / span) * 100;
    return {
      name: d.division,
      start: d.minHours,
      end: d.maxHours,
      runners: d.runners.length,
      widthPct: Math.max(widthPct, 0.5),
    };
  });

  return (
    <div className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-white p-4 sm:p-5">
      <p className="text-sm font-semibold text-[#1E3A5F]">Field Timeline</p>
      <p className="mt-0.5 text-xs text-[#1E3A5F]/65">How finishers spread across division bands</p>

      <svg viewBox="0 0 800 52" className="mt-4 w-full" role="img" aria-label="Division bands across finish times">
        {bands.map((b) => {
          const c = DIVISION_COLORS[b.name] ?? DIVISION_COLORS.Echo;
          const bx = x(b.start);
          return (
            <g key={b.name}>
              <rect
                x={bx}
                y={8}
                width={Math.max(x(Math.min(b.end, maxH)) - bx, 2)}
                height={32}
                fill={c.base}
                opacity={0.2}
                rx={2}
              />
              <line x1={bx} y1={6} x2={bx} y2={42} stroke={c.dark} strokeWidth={1.25} opacity={0.55} />
            </g>
          );
        })}
        {r.finishers.map((f, i) => {
          const h = f.finishTimeMs == null ? minH : f.finishTimeMs / 3_600_000;
          return (
            <circle
              key={f.id}
              cx={x(h)}
              cy={24 + ((i * 7919) % 11) - 5}
              r={2.4}
              fill={f.payoutCents > 0 ? "#E87722" : "#1E3A5F"}
              opacity={f.payoutCents > 0 ? 0.95 : 0.4}
            />
          );
        })}
        <line x1={24} y1={44} x2={776} y2={44} stroke="#1E3A5F" strokeWidth={1} opacity={0.2} />
        <text x={24} y={52} fontSize={10} fill="#1E3A5F" opacity={0.7}>
          {fmtHoursLabel(minH)}
        </text>
        <text x={776} y={52} fontSize={10} fill="#1E3A5F" opacity={0.7} textAnchor="end">
          {fmtHoursLabel(maxH)}
        </text>
      </svg>

      <div className="mt-3 flex h-2 overflow-hidden rounded-full ring-1 ring-[#1E3A5F]/10">
        {bands.map((b) => {
          const c = DIVISION_COLORS[b.name] ?? DIVISION_COLORS.Echo;
          return (
            <div
              key={`bar-${b.name}`}
              className="h-full min-w-[2px]"
              style={{ width: `${b.widthPct}%`, backgroundColor: c.base }}
              title={`${b.name}: ${fmtHoursLabel(b.start)} – ${fmtHoursLabel(b.end)}`}
            />
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {bands.map((b) => {
          const c = DIVISION_COLORS[b.name] ?? DIVISION_COLORS.Echo;
          return (
            <div
              key={`chip-${b.name}`}
              className="rounded-lg border px-3 py-2.5"
              style={{ borderColor: `${c.base}55`, backgroundColor: `${c.base}12` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                  style={{ backgroundColor: c.base }}
                  aria-hidden
                />
                <p className="text-sm font-semibold text-[#1E3A5F]">{b.name}</p>
              </div>
              <p className="mt-1 text-xs tabular-nums text-[#1E3A5F]/75">
                from <span className="font-medium text-[#1E3A5F]">{fmtHoursLabel(b.start)}</span>
              </p>
              <p className="text-xs text-[#1E3A5F]/55">
                {b.runners} {b.runners === 1 ? "finisher" : "finishers"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
