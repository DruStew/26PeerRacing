import { updateEventSchedule } from "@/lib/actions/update-event-schedule";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

type Props = {
  eventId: string;
  raceDate: string | null;
  endDate: string | null;
  /** Optional registration window start (datetime-local value). */
  entriesOpenAt?: string | null;
  returnTo: string;
  /** e.g. "Save schedule" */
  submitLabel?: string;
};

/**
 * Edit event-level race day and optional multi-day end date. Gun and entry deadlines are set per distance.
 */
export function EventScheduleForm({
  eventId,
  raceDate,
  endDate,
  entriesOpenAt,
  returnTo,
  submitLabel = "Save schedule",
}: Props) {
  const raceDateValue = raceDate?.trim() ?? "";
  const endDateValue = endDate?.trim() ?? "";
  const entriesOpenValue = entriesOpenAt?.trim() ?? "";

  return (
    <form action={updateEventSchedule} className="space-y-4">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="return_to" value={returnTo} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`race_date_${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
            Race day
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
            End date <span className="font-normal text-[#1E3A5F]/55">(optional — multi-day)</span>
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

      <div>
        <label htmlFor={`entries_open_${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
          Registration opens{" "}
          <span className="font-normal text-[#1E3A5F]/55">(optional — blank means open now)</span>
        </label>
        <input
          id={`entries_open_${eventId}`}
          name="entries_open_at"
          type="datetime-local"
          defaultValue={entriesOpenValue}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-[#1E3A5F]/55">
          Before this date the public page shows &quot;Registration opens …&quot; and online entries
          are blocked.
        </p>
      </div>

      <p className="text-xs leading-relaxed text-[#1E3A5F]/60">
        Gun time and entry deadline for each race are set on that distance&apos;s edit page.
      </p>

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
      >
        {submitLabel}
      </button>
    </form>
  );
}
