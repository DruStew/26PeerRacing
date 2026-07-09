"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import type { RaceMapEditor as RaceMapEditorType } from "./RaceMapEditor";

const RaceMapEditor = dynamic(() => import("./RaceMapEditor").then((m) => m.RaceMapEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-[28rem] w-full items-center justify-center rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] text-sm text-[#1E3A5F]/55">
      Loading race map…
    </div>
  ),
});

export function RaceMapEditorLazy(props: ComponentProps<typeof RaceMapEditorType>) {
  return <RaceMapEditor {...props} />;
}
