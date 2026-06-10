/**
 * Race-finish share card templates — PLACEHOLDER layouts, intentionally plain.
 * Final visual design is owned by the designer; these block out the slots:
 * racer photo, division badge art, name, race, time, overall place, division place,
 * money won (always shown — transparency is the brand), and event total payout.
 *
 * The shipping version composites these onto a canvas over the racer's camera photo
 * and exports via the native share sheet (Web Share API). For now they render as DOM
 * so layouts are easy to iterate on.
 */

import { DivisionBadge, DIVISION_COLORS } from "@/components/results/DivisionBadge";

export type ShareCardData = {
  firstName: string;
  lastName: string;
  raceName: string;
  eventName: string;
  timeRaw: string;
  overallPlace: number;
  division: string;
  divisionPlace: number;
  payoutCents: number;
  /** Event-wide payout flex line ("$12,400 paid out"). */
  eventTotalPayoutCents: number;
};

function usd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Stand-in for the racer's camera photo. */
function PhotoPlaceholder() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500">
      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium uppercase tracking-widest text-white/60">
        Racer photo
      </span>
    </div>
  );
}

const cardBase =
  "relative overflow-hidden rounded-xl text-white shadow-md aspect-[9/16] w-[270px] shrink-0";

/** 1 — Bottom bar: stat strip along the bottom, badge anchored right. */
export function CardBottomBar({ d }: { d: ShareCardData }) {
  const c = DIVISION_COLORS[d.division];
  return (
    <div className={cardBase}>
      <PhotoPlaceholder />
      <div className="absolute inset-x-0 bottom-0 bg-black/75 p-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/70">{d.raceName}</p>
            <p className="text-sm font-bold">
              {d.firstName} {d.lastName}
            </p>
            <p className="text-xs text-white/85">
              {d.timeRaw} · #{d.overallPlace} overall
            </p>
            <p className="text-xs font-semibold" style={{ color: c?.light }}>
              {d.division.toUpperCase()} {d.divisionPlace} · won {usd(d.payoutCents)}
            </p>
          </div>
          <DivisionBadge division={d.division} size={52} />
        </div>
      </div>
    </div>
  );
}

/** 2 — Corner badge: big badge top-left, stats stacked bottom-left. */
export function CardCornerBadge({ d }: { d: ShareCardData }) {
  return (
    <div className={cardBase}>
      <PhotoPlaceholder />
      <div className="absolute left-3 top-3">
        <DivisionBadge division={d.division} size={72} />
      </div>
      <div className="absolute bottom-3 left-3 space-y-0.5 rounded-lg bg-black/70 p-3">
        <p className="text-sm font-bold">
          {d.firstName} {d.lastName}
        </p>
        <p className="text-xs text-white/85">{d.raceName}</p>
        <p className="text-xs">
          {d.timeRaw} · #{d.overallPlace} · {d.division} {d.divisionPlace}
        </p>
        <p className="text-sm font-extrabold text-[#E87722]">{usd(d.payoutCents)} WON</p>
      </div>
    </div>
  );
}

/** 3 — Center stack: badge centered up top, stats centered at the bottom. */
export function CardCenterStack({ d }: { d: ShareCardData }) {
  return (
    <div className={cardBase}>
      <PhotoPlaceholder />
      <div className="absolute inset-x-0 top-4 flex justify-center">
        <DivisionBadge division={d.division} size={84} />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-10 text-center">
        <p className="text-base font-extrabold">
          {d.division.toUpperCase()} {d.divisionPlace}
        </p>
        <p className="text-xs text-white/85">
          {d.firstName} {d.lastName} · {d.timeRaw} · #{d.overallPlace} overall
        </p>
        <p className="mt-1 text-lg font-extrabold text-[#E87722]">{usd(d.payoutCents)}</p>
        <p className="text-[10px] uppercase tracking-widest text-white/60">{d.raceName}</p>
      </div>
    </div>
  );
}

/** 4 — Side rail: vertical stat rail down the left edge. */
export function CardSideRail({ d }: { d: ShareCardData }) {
  const c = DIVISION_COLORS[d.division];
  return (
    <div className={cardBase}>
      <PhotoPlaceholder />
      <div
        className="absolute bottom-0 left-0 top-0 flex w-[88px] flex-col items-center gap-2 p-2"
        style={{ backgroundColor: `${c?.dark}E6` }}
      >
        <DivisionBadge division={d.division} size={60} />
        <p className="text-center text-[11px] font-bold leading-tight">
          {d.division.toUpperCase()} {d.divisionPlace}
        </p>
        <p className="text-center text-[10px] text-white/85">#{d.overallPlace} overall</p>
        <p className="text-center text-[10px] text-white/85">{d.timeRaw}</p>
        <p className="mt-auto text-center text-xs font-extrabold text-white">
          {usd(d.payoutCents)}
        </p>
        <p className="text-center text-[9px] uppercase tracking-wider text-white/60">won</p>
      </div>
      <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-right">
        <p className="text-[11px] font-bold">
          {d.firstName} {d.lastName}
        </p>
        <p className="text-[9px] text-white/80">{d.raceName}</p>
      </div>
    </div>
  );
}

/** 5 — Full frame: division-colored border + event total payout flex line. */
export function CardFullFrame({ d }: { d: ShareCardData }) {
  const c = DIVISION_COLORS[d.division];
  return (
    <div className={cardBase} style={{ border: `6px solid ${c?.base}` }}>
      <PhotoPlaceholder />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-black/70 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest">{d.eventName}</p>
        <p className="text-[10px] text-white/80">{usd(d.eventTotalPayoutCents)} paid out</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-black/75 p-3">
        <div className="flex items-center gap-3">
          <DivisionBadge division={d.division} size={48} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {d.firstName} {d.lastName} — {d.division} {d.divisionPlace}
            </p>
            <p className="text-xs text-white/85">
              {d.timeRaw} · #{d.overallPlace} overall · {d.raceName}
            </p>
            <p className="text-sm font-extrabold" style={{ color: c?.light }}>
              {usd(d.payoutCents)} WON
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SHARE_CARD_TEMPLATES = [
  { id: "bottom-bar", name: "Bottom bar", Component: CardBottomBar },
  { id: "corner-badge", name: "Corner badge", Component: CardCornerBadge },
  { id: "center-stack", name: "Center stack", Component: CardCenterStack },
  { id: "side-rail", name: "Side rail", Component: CardSideRail },
  { id: "full-frame", name: "Full frame", Component: CardFullFrame },
] as const;
