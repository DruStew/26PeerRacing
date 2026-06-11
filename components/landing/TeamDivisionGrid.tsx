"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type TeamDivision = {
  name: string;
  src: string;
  description: string;
};

function usePrefersFinePointerHover() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setOk(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return ok;
}

const HOVER_OPEN_MS = 200;

export function TeamDivisionGrid({ teams }: { teams: readonly TeamDivision[] }) {
  const [open, setOpen] = useState<TeamDivision | null>(null);
  const hoverOpen = usePrefersFinePointerHover();
  const closeRef = useRef<HTMLButtonElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleId = useId();

  const close = useCallback(() => setOpen(null), []);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current != null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {teams.map((team) => (
          <button
            key={team.name}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open?.name === team.name}
            onClick={() => {
              clearHoverTimer();
              setOpen(team);
            }}
            onMouseEnter={() => {
              if (!hoverOpen) return;
              clearHoverTimer();
              hoverTimerRef.current = setTimeout(() => setOpen(team), HOVER_OPEN_MS);
            }}
            onMouseLeave={() => {
              clearHoverTimer();
            }}
            className="group relative overflow-hidden rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 p-2 text-left shadow-sm outline-none transition-all duration-200 hover:-translate-y-1 hover:border-[#E87722]/45 hover:shadow-lg hover:ring-2 hover:ring-[#E87722]/15 focus-visible:-translate-y-1 focus-visible:border-[#E87722]/45 focus-visible:shadow-lg focus-visible:ring-2 focus-visible:ring-[#E87722]/15"
          >
            <Image
              src={team.src}
              alt={team.name}
              width={220}
              height={220}
              unoptimized
              className="h-auto w-full"
            />
          </button>
        ))}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            aria-label="Close team details"
            className="absolute inset-0 bg-[#1E3A5F]/70 backdrop-blur-[2px]"
            onClick={close}
          />

          <div
            className="relative z-10 flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-none border border-[#1E3A5F]/15 bg-white shadow-2xl sm:max-h-[min(92dvh,900px)] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center border-b border-[#1E3A5F]/10 bg-[#fafbfc] px-4 py-3 sm:px-6">
              <h3 id={titleId} className="font-display text-lg font-semibold text-[#1E3A5F] sm:text-xl">
                {open.name}
              </h3>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 sm:py-8">
              <div className="mx-auto flex max-w-[min(22rem,70vw)] justify-center">
                <Image
                  src={open.src}
                  alt=""
                  width={440}
                  height={440}
                  unoptimized
                  className="h-auto w-full"
                />
              </div>
              <p className="mt-3 text-center text-xs text-[#1E3A5F]/60 sm:text-sm">
                Peer Racing team
              </p>
              <p className="mt-6 text-pretty text-base leading-relaxed text-[#1E3A5F]/90 sm:text-lg sm:leading-relaxed">
                {open.description}
              </p>
            </div>

            <div className="flex shrink-0 justify-center border-t border-[#1E3A5F]/10 bg-[#fafbfc] px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="inline-flex min-w-[8rem] items-center justify-center rounded-md bg-[#E87722] px-8 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
