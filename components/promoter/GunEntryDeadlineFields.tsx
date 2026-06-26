"use client";

import { useState } from "react";

import { entryDeadlineDatetimeLocalFromGun } from "@/lib/datetime-local";

type Props = {
  defaultGunTime: string;
  defaultEntryDeadline: string;
  inputClass: string;
};

/** Gun + entry deadline fields; deadline auto-fills to 30 minutes before gun (still editable). */
export function GunEntryDeadlineFields({
  defaultGunTime,
  defaultEntryDeadline,
  inputClass,
}: Props) {
  const [gunTime, setGunTime] = useState(defaultGunTime);
  const [entryDeadline, setEntryDeadline] = useState(defaultEntryDeadline);

  function handleGunChange(value: string) {
    setGunTime(value);
    const nextDeadline = entryDeadlineDatetimeLocalFromGun(value, 30);
    if (nextDeadline) setEntryDeadline(nextDeadline);
  }

  return (
    <>
      <div>
        <label htmlFor="gun_time" className="text-sm font-medium text-[#1E3A5F]">
          Gun time <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
        </label>
        <input
          id="gun_time"
          name="gun_time"
          type="datetime-local"
          value={gunTime}
          onChange={(e) => handleGunChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="pr_cutoff" className="text-sm font-medium text-[#1E3A5F]">
          Entry deadline <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
        </label>
        <input
          id="pr_cutoff"
          name="pr_cutoff"
          type="datetime-local"
          value={entryDeadline}
          onChange={(e) => setEntryDeadline(e.target.value)}
          className={inputClass}
        />
      </div>
    </>
  );
}
