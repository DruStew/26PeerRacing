"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";

function LoginForm() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? DEFAULT_PUBLIC_ROUTE;

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    const supabase = createClient();
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const callbackUrl = `${baseUrl.replace(/\/$/, "")}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`;
    const { error: signError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl },
    });
    if (signError) {
      setStatus("error");
      setError(signError.message);
      return;
    }
    setStatus("sent");
  };

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Member Access
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
          Sign In or Join
        </h1>
        <p className="mt-3 text-pretty text-[#1E3A5F]/75">
          Enter your email and we&apos;ll send you a magic link—no password to remember.
        </p>
        <p className="mt-2 text-pretty text-sm text-[#1E3A5F]/65">
          <strong className="font-semibold text-[#1E3A5F]/80">New to Peer Racing?</strong> Same box
          — click the link in your email and we&apos;ll walk you through your racer profile and
          membership.
        </p>

        <div className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm sm:p-8">
          {status === "sent" ? (
            <div
              className="flex gap-3 rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-4 py-4 text-emerald-950"
              role="status"
            >
              <span className="mt-0.5 shrink-0 text-emerald-700" aria-hidden>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
              <div>
                <p className="font-display font-semibold text-emerald-900">Check your inbox</p>
                <p className="mt-1 text-sm leading-relaxed text-emerald-900/90">
                  We sent a sign-in link to <strong className="font-semibold">{email}</strong>. Open
                  the email and tap the link to continue.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendLink} className="space-y-5">
              <div>
                <label htmlFor="email" className="text-sm font-medium text-[#1E3A5F]">
                  Email
                </label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#1E3A5F]/40">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </span>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-[#1E3A5F]/20 bg-white py-2.5 pl-11 pr-3 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
                    placeholder="you@example.com"
                  />
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
                {status === "loading" ? "Sending link…" : "Send magic link"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-[#1E3A5F]/70 sm:text-left">
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="font-medium text-[#E87722] underline-offset-2 transition-colors hover:text-[#E87722]/90 hover:underline"
          >
            Browse upcoming races
          </Link>{" "}
          <span className="text-[#1E3A5F]/55">(no sign-in required)</span>
        </p>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
          <LandingNavbar />
          <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-12">
            <div className="h-4 w-28 animate-pulse rounded bg-[#1E3A5F]/10" />
            <div className="mt-3 h-10 w-48 animate-pulse rounded bg-[#1E3A5F]/10" />
            <div className="mt-3 h-16 max-w-md animate-pulse rounded bg-[#1E3A5F]/5" />
            <div className="mt-8 h-48 animate-pulse rounded-xl bg-[#1E3A5F]/5" />
          </main>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
