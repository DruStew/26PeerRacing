/**
 * Backfill race-winnings wallet credits for already-published distances.
 *
 * Reads the official published `results` rows (the same numbers shown on the
 * results pages), and for each distance credits every racer's net winnings
 * (main division + female/military incentives) to their wallet as `race_payout`.
 *
 * Idempotent: per distance it first deletes existing race_payout credits
 * (matched on metadata.distance_id), then re-inserts — so re-running is safe and
 * never double-credits.
 *
 * Preview:  npm run test-race:backfill-payouts
 * Execute:  npm run test-race:backfill-payouts -- --confirm
 * Scope:    --event=<uuid>   (limit to one event)
 */

import { createClient } from "@supabase/supabase-js";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  }),
);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ONLY_EVENT = (args.get("event") ?? "").trim();
const CONFIRM = args.get("confirm") === "true";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

async function main() {
  if (!SUPABASE_URL) die("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!SERVICE_KEY) die("Missing SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Published distances (optionally scoped to one event).
  let distQuery = supabase
    .from("distances")
    .select("id,event_id,label,results_published_at")
    .not("results_published_at", "is", null);
  if (ONLY_EVENT) distQuery = distQuery.eq("event_id", ONLY_EVENT);
  const { data: distances, error: distErr } = await distQuery;
  if (distErr) die(`Load distances: ${distErr.message}`);
  if (!distances?.length) die("No published distances found.");

  // Event names for labels.
  const eventIds = [...new Set(distances.map((d) => d.event_id))];
  const { data: events } = await supabase.from("events").select("id,name").in("id", eventIds);
  const eventName = new Map((events ?? []).map((e) => [e.id, e.name ?? "Race"]));

  console.log(`=== BACKFILL ${CONFIRM ? "(EXECUTE)" : "(PREVIEW)"} ===`);
  let grandTotal = 0;
  let grandRacers = 0;

  for (const d of distances) {
    const { data: rows, error: resErr } = await supabase
      .from("results")
      .select(
        "user_id,entry_id,id,payout_cents,female_incentive_payout_cents,military_incentive_payout_cents",
      )
      .eq("distance_id", d.id)
      .eq("published", true);
    if (resErr) die(`Load results for ${d.label}: ${resErr.message}`);

    const credits = [];
    for (const r of rows ?? []) {
      if (!r.user_id) continue;
      const total =
        Number(r.payout_cents ?? 0) +
        Number(r.female_incentive_payout_cents ?? 0) +
        Number(r.military_incentive_payout_cents ?? 0);
      if (total <= 0) continue;
      credits.push({
        user_id: r.user_id,
        amount_cents: Math.round(total),
        category: "race_payout",
        label: `Race winnings — ${eventName.get(d.event_id)} · ${d.label}`,
        metadata: { event_id: d.event_id, distance_id: d.id, result_id: r.id },
        related_entry_id: r.entry_id ?? null,
      });
    }

    const subtotal = credits.reduce((s, c) => s + c.amount_cents, 0);
    grandTotal += subtotal;
    grandRacers += credits.length;
    console.log(
      `  ${eventName.get(d.event_id)} · ${d.label}: ${credits.length} racers, ${usd(subtotal)}`,
    );

    if (!CONFIRM) continue;

    // Reverse any prior credits for this distance, then insert fresh.
    const { error: delErr } = await supabase
      .from("wallet_ledger")
      .delete()
      .eq("category", "race_payout")
      .eq("metadata->>distance_id", d.id);
    if (delErr) die(`Reverse prior credits for ${d.label}: ${delErr.message}`);

    if (credits.length > 0) {
      const withSource = credits.map((c) => ({ ...c, source: "race_payout" }));
      let { error: insErr } = await supabase.from("wallet_ledger").insert(withSource);
      if (insErr && /source/i.test(insErr.message)) {
        ({ error: insErr } = await supabase.from("wallet_ledger").insert(credits));
      }
      if (insErr) die(`Insert credits for ${d.label}: ${insErr.message}`);
    }
  }

  console.log(`\nTotal: ${usd(grandTotal)} across ${grandRacers} racer-payouts.`);
  if (!CONFIRM) {
    console.log("\nPreview only — nothing written. Re-run with -- --confirm to execute.");
  } else {
    console.log("Done. Winnings credited to wallets.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
