"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function ProfileCompleteForm({
  userId,
  initial,
  returnUrl,
  phone,
}: {
  userId: string;
  initial: { first_name: string; last_name: string; dob: string; sex: string; email: string };
  returnUrl: string;
  phone?: string;
}) {
  const router = useRouter();
  const [first_name, setFirst_name] = useState(initial.first_name);
  const [last_name, setLast_name] = useState(initial.last_name);
  const [dob, setDob] = useState(initial.dob);
  const [sex, setSex] = useState(initial.sex);
  const [email, setEmail] = useState(initial.email);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        dob: dob.trim() || null,
        sex: sex === "male" || sex === "female" ? sex : null,
        email: email.trim() || null,
        ...(phone ? { phone } : {}),
      },
      { onConflict: "id" }
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
    <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
      <label htmlFor="first_name">First name</label>
      <input
        id="first_name"
        required
        value={first_name}
        onChange={(e) => setFirst_name(e.target.value)}
        style={{ display: "block", marginBottom: 12, width: "100%", padding: 8 }}
      />
      <label htmlFor="last_name">Last name</label>
      <input
        id="last_name"
        required
        value={last_name}
        onChange={(e) => setLast_name(e.target.value)}
        style={{ display: "block", marginBottom: 12, width: "100%", padding: 8 }}
      />
      <label htmlFor="dob">Date of birth</label>
      <input
        id="dob"
        name="dob"
        type="date"
        required
        value={dob}
        onChange={(e) => setDob(e.target.value)}
        style={{ display: "block", marginBottom: 12, width: "100%", padding: 8 }}
      />
      <label htmlFor="sex">Sex</label>
      <select
        id="sex"
        name="sex"
        required
        value={sex}
        onChange={(e) => setSex(e.target.value)}
        style={{ display: "block", marginBottom: 12, width: "100%", padding: 8 }}
      >
        <option value="">Select</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
      </select>
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
      {status === "error" && <p style={{ color: "red", marginBottom: 12 }}>{error}</p>}
      <button type="submit" disabled={status === "loading"}>
        {status === "loading" ? "Saving..." : "Save and continue"}
      </button>
    </form>
  );
}
