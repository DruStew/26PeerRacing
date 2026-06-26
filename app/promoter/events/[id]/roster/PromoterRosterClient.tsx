"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { CheckInRunnerClient } from "@/app/events/[id]/check-in/CheckInRunnerClient";

import { RosterSearchClient, type RosterRunner } from "./RosterSearchClient";

type Props = {
  eventId: string;
  notCheckedIn: RosterRunner[];
  partial: RosterRunner[];
  checkedIn: RosterRunner[];
};

export function PromoterRosterClient({ eventId, notCheckedIn, partial, checkedIn }: Props) {
  const router = useRouter();
  const [manageTarget, setManageTarget] = useState<{ userId: string | null; entryId: string | null } | null>(
    null,
  );

  const handleManage = useCallback((runner: RosterRunner) => {
    setManageTarget({
      userId: runner.userId,
      entryId: runner.entryId,
    });
  }, []);

  const handleRunnerClosed = useCallback(() => {
    setManageTarget(null);
    router.refresh();
  }, [router]);

  return (
    <>
      <section className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Runner Desk</h2>
        <p className="mt-1 text-sm text-[#1E3A5F]/70">
          Same tools as the race-day kiosk — search any member, add or withdraw entries, check in, and undo
          check-in (linked Carry-Over races stay in sync).
        </p>
        <CheckInRunnerClient
          eventId={eventId}
          variant="promoter"
          openUserId={manageTarget?.userId}
          openEntryId={manageTarget?.entryId}
          onRunnerClosed={handleRunnerClosed}
          onRosterRefresh={() => router.refresh()}
        />
      </section>

      <RosterSearchClient
        notCheckedIn={notCheckedIn}
        partial={partial}
        checkedIn={checkedIn}
        onManage={handleManage}
      />
    </>
  );
}
