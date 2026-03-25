"use client";

import { useCallback, useEffect, useState } from "react";

type DistanceItem = { id: string; label: string; entry_fee_cents: number };
type CartLine = { label: string; feeCents: number };

export function RaceSelectionAndCart({
  formId,
  distances,
  qualifierId,
  qualifierLabel,
  rollOverTargets,
  gunTimes,
}: {
  formId: string;
  distances: DistanceItem[];
  qualifierId: string | null;
  qualifierLabel: string;
  rollOverTargets: DistanceItem[];
  gunTimes: Record<string, string>;
}) {
  const [lineItems, setLineItems] = useState<CartLine[]>([]);
  const [totalCents, setTotalCents] = useState(0);

  const recalc = useCallback(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const primaryChecked = new Set<string>();
    form.querySelectorAll<HTMLInputElement>('input[name="enter_distance"]:checked').forEach((el) => {
      primaryChecked.add(el.value);
    });
    const rollOverChecked = new Set<string>();
    rollOverTargets.forEach((t) => {
      const name = `roll_over_${t.id}_from_${qualifierId}`;
      const el = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (el?.checked) rollOverChecked.add(t.id);
    });
    const lines: CartLine[] = [];
    let total = 0;
    distances.forEach((d) => {
      if (!primaryChecked.has(d.id)) return;
      const cents = d.entry_fee_cents ?? 0;
      const label = d.id === qualifierId ? `${d.label} Peer Racing Qualifier` : d.label;
      lines.push({ label, feeCents: cents });
      total += cents;
    });
    rollOverTargets.forEach((t) => {
      if (!rollOverChecked.has(t.id)) return;
      const cents = t.entry_fee_cents ?? 0;
      lines.push({ label: `${t.label} Roll Over`, feeCents: cents });
      total += cents;
    });
    setLineItems(lines);
    setTotalCents(total);
  }, [formId, distances, qualifierId, rollOverTargets]);

  useEffect(() => {
    recalc();
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("change", recalc);
    return () => form.removeEventListener("change", recalc);
  }, [formId, recalc]);

  const feeStr = (cents: number) => (cents === 0 ? "$0" : `$${(cents / 100).toFixed(2)}`);

  return (
    <>
      {distances.map((d) => {
        const isQualifier = qualifierId === d.id;
        const showRollOverHere = isQualifier && rollOverTargets.length > 0;
        const feeCents = d.entry_fee_cents ?? 0;
        const feeStrD = feeCents === 0 ? "$0" : `$${(feeCents / 100).toFixed(2)}`;
        const gunTime = gunTimes[d.id];
        return (
          <div key={d.id} style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              <input type="checkbox" name="enter_distance" value={d.id} />
              {d.label}
              <span style={{ fontWeight: 400, color: "#333" }}>{feeStrD}</span>
              {isQualifier && (
                <span style={{ fontWeight: 500, color: "#0066cc", fontSize: 14 }}>Peer Racing Qualifier</span>
              )}
              {gunTime && (
                <span style={{ fontWeight: 400, color: "#666" }}>({gunTime})</span>
              )}
            </label>
            {showRollOverHere && (
              <div style={{ marginLeft: 24, marginTop: 8, padding: 8, background: "#f8f9fa", borderRadius: 6 }}>
                <span style={{ fontSize: 14 }}>Also use my {qualifierLabel} time for:</span>
                {rollOverTargets.map((target) => (
                  <label key={target.id} style={{ display: "block", marginTop: 6, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      name={`roll_over_${target.id}_from_${qualifierId}`}
                      value="1"
                    />
                    {target.label}
                  </label>
                ))}
                <p style={{ fontSize: 12, color: "#666", marginTop: 6, marginBottom: 0 }}>
                  You run only the Qualifier and are entered in both.
                </p>
              </div>
            )}
          </div>
        );
      })}

      {(lineItems.length > 0 || totalCents > 0) && (
        <div style={{ marginTop: 16, padding: 16, border: "1px solid #ccc", borderRadius: 8, background: "#fafafa" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Entry fee summary</div>
          {lineItems.map((line) => (
            <div key={line.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>{line.label}</span>
              <span>{feeStr(line.feeCents)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginTop: 8, paddingTop: 8, borderTop: "1px solid #ccc" }}>
            <span>Total Entry Fee</span>
            <span>{feeStr(totalCents)}</span>
          </div>
        </div>
      )}
    </>
  );
}
