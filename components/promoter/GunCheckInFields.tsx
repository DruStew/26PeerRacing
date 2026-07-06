"use client";

import { useState } from "react";

import { entryDeadlineDatetimeLocalFromGun } from "@/lib/datetime-local";

type Props = {
  defaultGunTime: string;
  defaultCheckInOpens: string;
  defaultCheckInCloses: string;
  defaultAllowWalkUps: boolean;
  defaultWalkUpFeeDollars: string;
  defaultPacketPickupNotes?: string;
  inputClass: string;
};

/**
 * Gun time + race check-in window + walk-up entries, together in one block.
 * Check-in auto-fills to one hour before gun → gun time and stays editable.
 */
export function GunCheckInFields({
  defaultGunTime,
  defaultCheckInOpens,
  defaultCheckInCloses,
  defaultAllowWalkUps,
  defaultWalkUpFeeDollars,
  defaultPacketPickupNotes = "",
  inputClass,
}: Props) {
  const [gunTime, setGunTime] = useState(defaultGunTime);
  const [checkInOpens, setCheckInOpens] = useState(defaultCheckInOpens);
  const [checkInCloses, setCheckInCloses] = useState(defaultCheckInCloses);
  const [allowWalkUps, setAllowWalkUps] = useState(defaultAllowWalkUps);

  function handleGunChange(value: string) {
    setGunTime(value);
    const opens = entryDeadlineDatetimeLocalFromGun(value, 60);
    if (opens) setCheckInOpens(opens);
    if (value.trim()) setCheckInCloses(value.trim());
  }

  return (
    <>
      <div>
        <label htmlFor="gun_time" className="text-sm font-medium text-[#1E3A5F]">
          Gun time <span className="font-normal text-[#1E3A5F]/55">(when this race starts)</span>
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

      <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
        <p className="font-display text-base font-semibold text-[#1E3A5F]">Race Check-In</p>
        <p className="mt-1 text-sm text-[#1E3A5F]/70">
          When your check-in desk is open for this race. Auto-fills to one hour before gun time.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="check_in_opens_at" className="text-sm font-medium text-[#1E3A5F]">
              From
            </label>
            <input
              id="check_in_opens_at"
              name="check_in_opens_at"
              type="datetime-local"
              value={checkInOpens}
              onChange={(e) => setCheckInOpens(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="check_in_closes_at" className="text-sm font-medium text-[#1E3A5F]">
              To
            </label>
            <input
              id="check_in_closes_at"
              name="check_in_closes_at"
              type="datetime-local"
              value={checkInCloses}
              onChange={(e) => setCheckInCloses(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="packet_pickup_info" className="text-sm font-medium text-[#1E3A5F]">
            Bib, Check-In, Packet Pickup Notes{" "}
            <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
          </label>
          <textarea
            id="packet_pickup_info"
            name="packet_pickup_info"
            rows={3}
            defaultValue={defaultPacketPickupNotes}
            placeholder="Packet pickup Fri 1–6 PM at the pavilion. Bring your ID for bib pickup."
            className={inputClass}
          />
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[#1E3A5F]">
          <input
            type="checkbox"
            name="allow_walk_ups"
            value="1"
            checked={allowWalkUps}
            onChange={(e) => setAllowWalkUps(e.target.checked)}
            className="h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
          />
          Allow walk-up entries (register at the desk during check-in)
        </label>

        {allowWalkUps ? (
          <div className="mt-3">
            <label htmlFor="walk_up_fee_dollars" className="text-sm font-medium text-[#1E3A5F]">
              Race-day entry fee ($){" "}
              <span className="font-normal text-[#1E3A5F]/55">(blank uses the online fee)</span>
            </label>
            <input
              id="walk_up_fee_dollars"
              name="walk_up_fee_dollars"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              defaultValue={defaultWalkUpFeeDollars}
              className={inputClass}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
