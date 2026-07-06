import { updateOrganizerContact } from "@/lib/actions/update-organizer-contact";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

type Props = {
  eventId: string;
  organizerContactName: string | null;
  organizerContactEmail: string | null;
  defaultPromoterEmail: string | null;
  returnTo: string;
};

export function OrganizerContactForm({
  eventId,
  organizerContactName,
  organizerContactEmail,
  defaultPromoterEmail,
  returnTo,
}: Props) {
  return (
    <form action={updateOrganizerContact} className="space-y-4">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="return_to" value={returnTo} />

      <p className="text-sm leading-relaxed text-[#1E3A5F]/75">
        Runners reach you through a contact form on your public event page — your email is never shown. Leave the
        email blank to use your Peer Racing profile email
        {defaultPromoterEmail ? (
          <>
            {" "}
            (<span className="font-mono text-xs">{defaultPromoterEmail}</span>)
          </>
        ) : (
          " (add an email on your profile if needed)"
        )}
        . Peer Racing receives a copy of every message.
      </p>

      <div>
        <label htmlFor={`organizer_name_${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
          Organizer display name
        </label>
        <input
          id={`organizer_name_${eventId}`}
          name="organizer_contact_name"
          defaultValue={organizerContactName ?? ""}
          className={inputClass}
          placeholder="Green Country Trails RD"
        />
        <p className="mt-1 text-xs text-[#1E3A5F]/55">Shown on the public contact form.</p>
      </div>

      <div>
        <label htmlFor={`organizer_email_${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
          Contact email <span className="font-normal text-[#1E3A5F]/55">(optional override)</span>
        </label>
        <input
          id={`organizer_email_${eventId}`}
          name="organizer_contact_email"
          type="email"
          autoComplete="email"
          defaultValue={organizerContactEmail ?? ""}
          className={inputClass}
          placeholder={defaultPromoterEmail ?? "info@yourrace.com"}
        />
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
      >
        Save contact settings
      </button>
    </form>
  );
}
