import { EventContactForm } from "@/components/events/EventContactForm";

type Props = {
  eventId: string;
  eventName: string;
  organizerContactName: string | null;
  defaultSenderName?: string;
  defaultSenderEmail?: string;
};

export function EventContactSection({
  eventId,
  eventName,
  organizerContactName,
  defaultSenderName,
  defaultSenderEmail,
}: Props) {
  const organizerLabel = organizerContactName?.trim() || `${eventName} race organizer`;

  return (
    <section
      id="contact"
      className="mt-10 scroll-mt-24 rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Questions about this race?</h2>
      <EventContactForm
        eventId={eventId}
        organizerLabel={organizerLabel}
        defaultName={defaultSenderName}
        defaultEmail={defaultSenderEmail}
      />
    </section>
  );
}
