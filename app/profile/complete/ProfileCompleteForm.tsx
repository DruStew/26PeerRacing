"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { isPlausibleCellPhone } from "@/lib/profile";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

export function ProfileCompleteForm({
  userId,
  initial,
  returnUrl,
}: {
  userId: string;
  initial: {
    first_name: string;
    last_name: string;
    dob: string;
    sex: string;
    email: string;
    phone: string;
    hometown: string;
    home_state: string;
    zip: string;
  };
  returnUrl: string;
}) {
  const router = useRouter();
  const [first_name, setFirst_name] = useState(initial.first_name);
  const [last_name, setLast_name] = useState(initial.last_name);
  const [dob, setDob] = useState(initial.dob);
  const [sex, setSex] = useState(initial.sex);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [hometown, setHometown] = useState(initial.hometown);
  const [home_state, setHome_state] = useState(initial.home_state);
  const [zip, setZip] = useState(initial.zip);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const phoneTrimmed = phone.trim();
    if (!isPlausibleCellPhone(phoneTrimmed)) {
      setStatus("error");
      setError(
        "Enter a valid cell number with at least 10 digits (include area code; country code is fine).",
      );
      return;
    }
    setStatus("loading");
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        dob: dob.trim() || null,
        sex: sex === "male" || sex === "female" ? sex : null,
        email: email.trim() || null,
        phone: phoneTrimmed,
        hometown: hometown.trim() || null,
        home_state: home_state.trim() || null,
        zip: zip.trim() || null,
      },
      { onConflict: "id" },
    );
    if (upsertError) {
      setStatus("error");
      setError(upsertError.message);
      return;
    }
    router.push(returnUrl);
    router.refresh();
  };

  return (
    <div className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm sm:p-8">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="first_name" className="text-sm font-medium text-[#1E3A5F]">
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            autoComplete="given-name"
            required
            value={first_name}
            onChange={(e) => setFirst_name(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="last_name" className="text-sm font-medium text-[#1E3A5F]">
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            autoComplete="family-name"
            required
            value={last_name}
            onChange={(e) => setLast_name(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-medium text-[#1E3A5F]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="phone" className="text-sm font-medium text-[#1E3A5F]">
            Cell phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="+1 555 123 4567"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-[#1E3A5F]/60">
            Required: at least 10 digits (area code included; +country code is fine). Used for your
            account, race communications, and future SMS or push notifications—use a number you
            keep with you on race day.
          </p>
        </div>
        <div>
          <label htmlFor="dob" className="text-sm font-medium text-[#1E3A5F]">
            Date of birth
          </label>
          <input
            id="dob"
            name="dob"
            type="date"
            required
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="sex" className="text-sm font-medium text-[#1E3A5F]">
            Sex
          </label>
          <select
            id="sex"
            name="sex"
            required
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          >
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        <div className="border-t border-[#1E3A5F]/10 pt-5">
          <p className="text-sm font-medium text-[#1E3A5F]">Home location (optional)</p>
          <p className="mt-1 text-xs text-[#1E3A5F]/60">
            Helps us tell you about races near you. You can skip this and add it later.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="hometown" className="text-sm font-medium text-[#1E3A5F]">
                Hometown
              </label>
              <input
                id="hometown"
                name="hometown"
                autoComplete="address-level2"
                value={hometown}
                onChange={(e) => setHometown(e.target.value)}
                className={inputClass}
                placeholder="City or area"
              />
            </div>
            <div>
              <label htmlFor="home_state" className="text-sm font-medium text-[#1E3A5F]">
                State
              </label>
              <input
                id="home_state"
                name="home_state"
                autoComplete="address-level1"
                value={home_state}
                onChange={(e) => setHome_state(e.target.value)}
                className={inputClass}
                placeholder="e.g. TX"
                maxLength={32}
              />
            </div>
            <div>
              <label htmlFor="zip" className="text-sm font-medium text-[#1E3A5F]">
                ZIP code
              </label>
              <input
                id="zip"
                name="zip"
                autoComplete="postal-code"
                inputMode="numeric"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className={inputClass}
                placeholder="12345"
                maxLength={16}
              />
            </div>
          </div>
        </div>

        {status === "error" && error ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex w-full items-center justify-center rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
