"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type VisualExampleImageProps = {
  src: string;
  alt: string;
};

export function VisualExampleImage({ src, alt }: VisualExampleImageProps) {
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

  const modalContent = open ? (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-3 sm:p-4"
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
        className="relative z-[201] h-[min(96dvh,1920px)] w-[min(96vw,calc(min(96dvh,1920px)*9/16))] max-h-[96dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="96vw"
          className="object-contain"
          priority
        />
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="mt-6 flex w-full max-w-[1080px] flex-col items-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Click to view full screen"
          className="group block w-full cursor-zoom-in rounded-lg border border-[#1E3A5F]/15 bg-white text-center shadow-md transition hover:border-[#E87722]/45 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E87722] focus-visible:ring-offset-2"
          aria-label={`View ${alt} full screen`}
        >
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[1080px] overflow-hidden rounded-lg">
            <Image
              src={src}
              alt={alt}
              fill
              className="object-contain"
              sizes="(max-width: 1280px) 100vw, 1080px"
              priority
            />
          </div>
          <span className="block px-2 py-3 text-sm font-medium text-[#1E3A5F]/70 transition-colors group-hover:text-[#E87722] sm:text-base">
            Click or tap to enlarge
          </span>
        </button>
      </div>
      {open && typeof document !== "undefined" && modalContent
        ? createPortal(modalContent, document.body)
        : null}
    </>
  );
}
