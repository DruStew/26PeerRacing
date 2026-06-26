"use client";

import { useState, useTransition } from "react";

type Props = {
  eventId: string;
  onCreated: (userId: string) => void;
  onClose: () => void;
};

export function KioskCreateMemberPanel({ eventId, onCreated, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setSuccess(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await fetch("/api/kiosk/check-in/create-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          first_name: formData.get("first_name"),
          last_name: formData.get("last_name"),
          email: formData.get("email"),
          phone: formData.get("phone"),
          dob: formData.get("dob"),
          sex: formData.get("sex"),
          active_or_retired_military: formData.get("active_or_retired_military") === "1",
          hometown: formData.get("hometown"),
          home_state: formData.get("home_state"),
          zip: formData.get("zip"),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        userId?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.userId) {
        setMessage(json.error ?? "Could not create member");
        return;
      }
      setSuccess(json.message ?? "Member created.");
      onCreated(json.userId);
    });
  }

  const fieldClass =
    "mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-1 focus:ring-[#E87722]";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1E3A5F]/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kiosk-create-member-title"
    >
      <div className="flex max-h-[95dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="border-b border-[#1E3A5F]/10 px-4 py-4">
          <h2 id="kiosk-create-member-title" className="font-display text-xl font-bold text-[#1E3A5F]">
            Create New PR Member
          </h2>
          <p className="mt-1 text-sm text-[#1E3A5F]/70">
            Walk-up registration — we&apos;ll email them a magic link to sign in on their phone later.
          </p>
        </div>

        <form onSubmit={onSubmit} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-[#1E3A5F]">First name *</label>
              <input name="first_name" required className={fieldClass} autoComplete="given-name" />
            </div>
            <div>
              <label className="text-sm font-medium text-[#1E3A5F]">Last name *</label>
              <input name="last_name" required className={fieldClass} autoComplete="family-name" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-[#1E3A5F]">Email *</label>
              <input name="email" type="email" required className={fieldClass} autoComplete="email" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-[#1E3A5F]">Cell phone *</label>
              <input name="phone" type="tel" required className={fieldClass} autoComplete="tel" />
            </div>
            <div>
              <label className="text-sm font-medium text-[#1E3A5F]">Date of birth *</label>
              <input name="dob" type="date" required className={fieldClass} />
            </div>
            <div>
              <label className="text-sm font-medium text-[#1E3A5F]">Sex *</label>
              <select name="sex" required className={fieldClass} defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <span className="text-sm font-medium text-[#1E3A5F]">Active or retired military? *</span>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="active_or_retired_military" value="1" required />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="active_or_retired_military" value="0" required />
                  No
                </label>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[#1E3A5F]">Hometown</label>
              <input name="hometown" className={fieldClass} />
            </div>
            <div>
              <label className="text-sm font-medium text-[#1E3A5F]">State</label>
              <input name="home_state" className={fieldClass} maxLength={2} placeholder="TX" />
            </div>
          </div>

          {message ? (
            <p className="mt-4 text-sm font-medium text-red-700" role="alert">
              {message}
            </p>
          ) : null}
          {success ? (
            <p className="mt-4 text-sm font-medium text-emerald-800" role="status">
              {success}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#1E3A5F]/25 px-4 py-2.5 text-sm font-semibold text-[#1E3A5F]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create member & send magic link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
