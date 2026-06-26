/**
 * Backfill promoter wallet credits + distance_financial_snapshots for already-published races.
 *
 * Uses payout settings + entry counts for the producer/PR waterfall, and published
 * `results` rows for runner payout totals and check counts.
 *
 * Preview:  npm run test-race:backfill-promoter-finance
 * Execute:  npm run test-race:backfill-promoter-finance -- --confirm
 * Scope:    --event=<uuid>
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

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function waterfallCents(settings, entryCount, entryFeeCents) {
  const grossPotCents = Math.max(0, Math.round(entryCount * entryFeeCents));
  const processingFeeFraction = clamp(Number(settings.processing_fee_fraction ?? 0.04), 0, 1);
  const shootoutFraction = clamp(Number(settings.shootout_fraction ?? 0), 0, 1);
  const prHoldingFraction = clamp(Number(settings.pr_holding_fraction ?? 0.5), 0, 1);
  const producerFraction = clamp(Number(settings.producer_fraction_of_pr_holding ?? 0.5), 0, 1);

  const processingFeeCents = Math.round(grossPotCents * processingFeeFraction);
  const netAfterProcessingCents = grossPotCents - processingFeeCents;
  const shootoutFundCents = Math.round(netAfterProcessingCents * shootoutFraction);
  const netAfterShootoutCents = netAfterProcessingCents - shootoutFundCents;
  const prHoldingCents = Math.round(netAfterShootoutCents * prHoldingFraction);
  const racersPotCents = netAfterShootoutCents - prHoldingCents;
  const producerCents = Math.round(prHoldingCents * producerFraction);
  const peerRacingOrgCents = prHoldingCents - producerCents;

  return {
    grossPotCents,
    processingFeeCents,
    shootoutFundCents,
    prHoldingCents,
    racersPotCents,
    producerCents,
    peerRacingOrgCents,
  };
}

function countChecks(rows) {
  let n = 0;
  for (const r of rows) {
    if (Number(r.payout_cents ?? 0) > 0) n += 1;
    if (Number(r.female_incentive_payout_cents ?? 0) > 0) n += 1;
    if (Number(r.military_incentive_payout_cents ?? 0) > 0) n += 1;
  }
  return n;
}

async function main() {
  if (!SUPABASE_URL) die("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!SERVICE_KEY) die("Missing SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let distQuery = supabase
    .from("distances")
    .select("id,event_id,label,entry_fee_cents,results_published_at")
    .not("results_published_at", "is", null);
  if (ONLY_EVENT) distQuery = distQuery.eq("event_id", ONLY_EVENT);
  const { data: distances, error: distErr } = await distQuery;
  if (distErr) die(`Load distances: ${distErr.message}`);
  if (!distances?.length) die("No published distances found.");

  const eventIds = [...new Set(distances.map((d) => d.event_id))];
  const { data: events } = await supabase.from("events").select("id,name,promoter_id").in("id", eventIds);
  const eventById = new Map((events ?? []).map((e) => [e.id, e]));

  console.log(`=== PROMOTER FINANCE BACKFILL ${CONFIRM ? "(EXECUTE)" : "(PREVIEW)"} ===`);
  let totalProducer = 0;

  for (const d of distances) {
    const event = eventById.get(d.event_id);
    const promoterId = event?.promoter_id ?? null;

    const { data: settings } = await supabase
      .from("distance_payout_settings")
      .select("*")
      .eq("distance_id", d.id)
      .maybeSingle();

    const { count: registeredEntryCount } = await supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("event_id", d.event_id)
      .eq("distance_id", d.id);

    const feeCents = settings?.entry_fee_cents_override ?? d.entry_fee_cents ?? 0;
    const entryCount = settings?.entry_count_override ?? registeredEntryCount ?? 0;
    const wf = waterfallCents(settings ?? {}, entryCount, feeCents);

    const { data: results } = await supabase
      .from("results")
      .select("payout_cents,female_incentive_payout_cents,military_incentive_payout_cents")
      .eq("distance_id", d.id)
      .eq("published", true);

    const totalRunnerPayoutCents = (results ?? []).reduce(
      (s, r) =>
        s +
        Number(r.payout_cents ?? 0) +
        Number(r.female_incentive_payout_cents ?? 0) +
        Number(r.military_incentive_payout_cents ?? 0),
      0,
    );
    const checksPaidCount = countChecks(results ?? []);

    console.log(
      `  ${event?.name ?? "Event"} · ${d.label}: producer ${usd(wf.producerCents)}, runners ${usd(totalRunnerPayoutCents)}, ${checksPaidCount} checks`,
    );
    totalProducer += wf.producerCents;

    if (!CONFIRM) continue;

    const publishedAt = d.results_published_at ?? new Date().toISOString();

    await supabase.from("distance_financial_snapshots").upsert(
      {
        distance_id: d.id,
        event_id: d.event_id,
        promoter_id: promoterId,
        published_at: publishedAt,
        entry_count: entryCount,
        gross_pot_cents: wf.grossPotCents,
        processing_fee_cents: wf.processingFeeCents,
        shootout_fund_cents: wf.shootoutFundCents,
        pr_holding_cents: wf.prHoldingCents,
        producer_cents: wf.producerCents,
        peer_racing_org_cents: wf.peerRacingOrgCents,
        racers_pot_cents: wf.racersPotCents,
        total_runner_payout_cents: totalRunnerPayoutCents,
        checks_paid_count: checksPaidCount,
      },
      { onConflict: "distance_id" },
    );

    await supabase
      .from("wallet_ledger")
      .delete()
      .eq("category", "promoter_event_earnings")
      .eq("metadata->>distance_id", d.id);

    if (promoterId && wf.producerCents > 0) {
      const row = {
        user_id: promoterId,
        amount_cents: wf.producerCents,
        category: "promoter_event_earnings",
        label: `Event earnings — ${event?.name ?? "Race"} · ${d.label}`,
        metadata: { event_id: d.event_id, distance_id: d.id },
        source: "promoter_event_earnings",
      };
      let { error: insErr } = await supabase.from("wallet_ledger").insert(row);
      if (insErr && /source/i.test(insErr.message)) {
        const { source: _s, ...withoutSource } = row;
        ({ error: insErr } = await supabase.from("wallet_ledger").insert(withoutSource));
      }
      if (insErr) die(`Promoter credit for ${d.label}: ${insErr.message}`);
    }
  }

  console.log(`\nTotal promoter earnings: ${usd(totalProducer)} across ${distances.length} distances.`);
  if (!CONFIRM) {
    console.log("\nPreview only — nothing written. Re-run with -- --confirm to execute.");
  } else {
    console.log("Done. Snapshots + promoter wallet credits written.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
