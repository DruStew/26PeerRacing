"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

export function DemoEventCreateForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch("/api/admin/demo-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          city: fd.get("city"),
          state: fd.get("state"),
          race_date: fd.get("race_date"),
          end_date: fd.get("end_date") || null,
          event_type: fd.get("event_type"),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; editUrl?: string };
      if (!res.ok || !json.ok || !json.editUrl) {
        setError(json.error ?? "Could not create demo race");
        return;
      }
      router.push(json.editUrl);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5 rounded-xl border border-violet-200 bg-white p-6 shadow-sm">
      <div>
        <label htmlFor="name" className="text-sm font-medium text-[#1E3A5F]">
          Event name
        </label>
        <input id="name" name="name" required className={inputClass} placeholder="Spring Trail Demo" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="city" className="text-sm font-medium text-[#1E3A5F]">
            City
          </label>
          <input id="city" name="city" className={inputClass} />
        </div>
        <div>
          <label htmlFor="state" className="text-sm font-medium text-[#1E3A5F]">
            State
          </label>
          <input id="state" name="state" className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="race_date" className="text-sm font-medium text-[#1E3A5F]">
          Race date
        </label>
        <input id="race_date" name="race_date" type="date" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="end_date" className="text-sm font-medium text-[#1E3A5F]">
          End date <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
        </label>
        <input id="end_date" name="end_date" type="date" className={inputClass} />
      </div>
      <div>
        <label htmlFor="event_type" className="text-sm font-medium text-[#1E3A5F]">
          Event type
        </label>
        <select id="event_type" name="event_type" defaultValue="full" className={`${inputClass} cursor-pointer`}>
          <option value="full">Full</option>
          <option value="overlay">Overlay</option>
        </select>
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create demo race"}
        </button>
        <Link
          href="/admin/demo-races"
          className="inline-flex items-center rounded-md border border-[#1E3A5F]/20 px-5 py-3 text-sm font-semibold text-[#1E3A5F] hover:border-[#E87722]"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
