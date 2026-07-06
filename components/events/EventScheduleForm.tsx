import { updateEventSchedule } from "@/lib/actions/update-event-schedule";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

type Props = {
  eventId: string;
  raceDate: string | null;
  endDate: string | null;
  /** Online registration opens (datetime-local value). */
  entriesOpenAt?: string | null;
  /** Online registration closes (datetime-local value) — event-level pr_cutoff. */
  onlineRegClosesAt?: string | null;
  returnTo: string;
  /** e.g. "Save schedule" */
  submitLabel?: string;
};

/**
 * Edit event dates and the online registration window. Gun times and race
 * check-in windows are set per distance.
 */
export function EventScheduleForm({
  eventId,
  raceDate,
  endDate,
  entriesOpenAt,
  onlineRegClosesAt,
  returnTo,
  submitLabel = "Save schedule",
}: Props) {
  const raceDateValue = raceDate?.trim() ?? "";
  const endDateValue = endDate?.trim() ?? "";
  const entriesOpenValue = entriesOpenAt?.trim() ?? "";
  const onlineRegClosesValue = onlineRegClosesAt?.trim() ?? "";

  return (
    <form action={updateEventSchedule} className="space-y-5">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="return_to" value={returnTo} />

      <div>
        <p className="text-sm font-semibold text-[#1E3A5F]">Event dates</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`race_date_${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
              Start date
            </label>
            <input
              id={`race_date_${eventId}`}
              name="race_date"
              type="date"
              required
              defaultValue={raceDateValue}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`end_date_${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
              End date{" "}
              <span className="font-normal text-[#1E3A5F]/55">(only if multi-day)</span>
            </label>
            <input
              id={`end_date_${eventId}`}
              name="end_date"
              type="date"
              defaultValue={endDateValue}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-[#1E3A5F]">Online registration opens / closes</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`entries_open_${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
              From <span className="font-normal text-[#1E3A5F]/55">(blank = open now)</span>
            </label>
            <input
              id={`entries_open_${eventId}`}
              name="entries_open_at"
              type="datetime-local"
              defaultValue={entriesOpenValue}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor={`online_reg_closes_${eventId}`}
              className="text-sm font-medium text-[#1E3A5F]"
            >
              To <span className="font-normal text-[#1E3A5F]/55">(blank = open until results)</span>
            </label>
            <input
              id={`online_reg_closes_${eventId}`}
              name="online_reg_closes_at"
              type="datetime-local"
              defaultValue={onlineRegClosesValue}
              className={inputClass}
            />
          </div>
        </div>
        <p className="mt-1.5 text-xs text-[#1E3A5F]/55">
          The window when runners can register online. Race-day check-in and walk-up entries are set
          per distance.
        </p>
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
      >
        {submitLabel}
      </button>
    </form>
  );
}
