export const EVENT_CONTACT_TOPICS = [
  { value: "withdrawal", label: "Withdraw from a race" },
  { value: "transfer", label: "Transfer or change distance" },
  { value: "bib", label: "Bib or check-in question" },
  { value: "registration", label: "Registration or payment" },
  { value: "other", label: "Other question" },
] as const;

export type EventContactTopic = (typeof EVENT_CONTACT_TOPICS)[number]["value"];

export function isEventContactTopic(value: string): value is EventContactTopic {
  return EVENT_CONTACT_TOPICS.some((t) => t.value === value);
}

export function eventContactTopicLabel(topic: EventContactTopic): string {
  return EVENT_CONTACT_TOPICS.find((t) => t.value === topic)?.label ?? topic;
}
