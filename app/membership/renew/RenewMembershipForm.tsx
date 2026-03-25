"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RenewMembershipForm({ returnUrl }: { returnUrl: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleRenew = async () => {
    setStatus("loading");
    setError(null);
    const res = await fetch("/api/membership/renew", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus("error");
      setError(data.error ?? "Renewal failed");
      return;
    }
    router.push("/membership/renewed");
    router.refresh();
  };

  return (
    <div style={{ marginTop: 24 }}>
      <button type="button" onClick={handleRenew} disabled={status === "loading"}>
        {status === "loading" ? "Renewing…" : "Renew membership (free)"}
      </button>
      {status === "error" && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
