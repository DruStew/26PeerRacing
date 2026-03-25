"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/events";

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
    <main style={{ padding: 24, maxWidth: 400 }}>
      <h1>Peer Racing</h1>
      <p>Sign in with your email. We&apos;ll send you a magic link (no password).</p>

      {status !== "sent" && (
        <form onSubmit={handleSendLink}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: "block", marginBottom: 12, width: "100%", padding: 8 }}
          />
          <button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Sending link..." : "Send magic link"}
          </button>
        </form>
      )}

      {status === "sent" && (
        <p style={{ marginTop: 12 }}>
          Check <strong>{email}</strong> for the login link. Click it to sign in.
        </p>
      )}

      {status === "error" && <p style={{ color: "red", marginTop: 12 }}>{error}</p>}

      <p style={{ marginTop: 24, fontSize: 14 }}>
        <Link href="/events">Browse events</Link> (no login required)
      </p>
    </main>
  );
}
