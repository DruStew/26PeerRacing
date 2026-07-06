"use client";

import { useState } from "react";

import { EVENT_CONTACT_TOPICS } from "@/lib/event-contact/topics";

const inputClass =
  "mt-1 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

type Props = {
  eventId: string;
  organizerLabel: string;
  defaultName?: string;
  defaultEmail?: string;
};

export function EventContactForm({ eventId, organizerLabel, defaultName = "", defaultEmail = "" }: Props) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [topic, setTopic] = useState<string>(EVENT_CONTACT_TOPICS[0]?.value ?? "other");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/events/${eventId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message, website }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not send your message.");
        return;
      }
      setSuccess(json.message ?? "Message sent.");
      setMessage("");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <p className="text-sm leading-relaxed text-[#1E3A5F]/75">
        Send a message to <span className="font-semibold text-[#1E3A5F]">{organizerLabel}</span>. Your email is
        never shown publicly — the organizer replies directly to you. Peer Racing receives a copy so we can help
        if needed.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`contact-name-${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
            Your name
          </label>
          <input
            id={`contact-name-${eventId}`}
            name="name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`contact-email-${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
            Your email
          </label>
          <input
            id={`contact-email-${eventId}`}
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`contact-topic-${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
          Topic
        </label>
        <select
          id={`contact-topic-${eventId}`}
          name="topic"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className={`${inputClass} cursor-pointer`}
        >
          {EVENT_CONTACT_TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`contact-message-${eventId}`} className="text-sm font-medium text-[#1E3A5F]">
          Message
        </label>
        <textarea
          id={`contact-message-${eventId}`}
          name="message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={inputClass}
          placeholder="Tell the race organizer what you need help with…"
        />
      </div>

      <div className="hidden" aria-hidden>
        <label htmlFor={`contact-website-${eventId}`}>Website</label>
        <input
          id={`contact-website-${eventId}`}
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          {success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
