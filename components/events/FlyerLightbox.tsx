"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type FlyerLightboxProps = {
  src: string;
  alt: string;
  /** Compact thumbnail on /events cards */
  variant?: "card" | "detail";
};

export function FlyerLightbox({ src, alt, variant = "card" }: FlyerLightboxProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const thumbClass =
    variant === "card"
      ? "relative block aspect-[21/9] w-full shrink-0 overflow-hidden rounded-lg border border-[#1E3A5F]/10 bg-[#fafbfc] sm:aspect-auto sm:h-28 sm:w-36"
      : "relative mt-6 block aspect-[21/9] w-full overflow-hidden rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc]";

  const modal = open ? (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={() => setOpen(false)}
    >
      <button
        type="button"
        className="absolute right-3 top-3 z-[202] rounded-full bg-white/15 p-2.5 text-white ring-1 ring-white/30 transition-colors hover:bg-white/25"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
        }}
        aria-label="Close"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div
        className="relative z-[201] flex max-h-[min(90vh,1080px)] max-w-[min(95vw,1920px)] items-center justify-center p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={src}
          alt={alt}
          width={1920}
          height={1080}
          className="h-auto max-h-[min(90vh,1080px)] w-auto max-w-full object-contain"
          sizes="95vw"
          priority
        />
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${thumbClass} cursor-zoom-in text-left transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E87722] focus-visible:ring-offset-2`}
        aria-label={`View ${alt} full screen`}
      >
        <span className="relative block h-full w-full">
          <Image
            src={src}
            alt=""
            fill
            className={variant === "card" ? "object-cover" : "object-contain object-center"}
            sizes={variant === "card" ? "(max-width: 640px) 100vw, 9rem" : "(max-width: 896px) 100vw, 896px"}
          />
        </span>
        <span className="sr-only">{alt}</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(modal, document.body)
        : null}
    </>
  );
}
