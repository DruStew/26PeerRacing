/**
 * Scripted kiosk check-in for the race-weekend rehearsal. Mirrors the kiosk
 * exactly (sets entries.kiosk_checked_in_at) and assigns race-day bibs
 * (entries.assigned_bib) the way host timing would — one bib per runner,
 * shared across their distances.
 *
 * Leaves NO_SHOW_PCT of runners unchecked (default 8%) for realism, and skips
 * entries that are already checked in — so check some in manually at the kiosk
 * first, then run this for the rest.
 *
 * Preview:  npm run test-race:checkin -- --event=<uuid>
 * Execute:  npm run test-race:checkin -- --event=<uuid> --confirm
 * Options:  --no-show=8  --bib-start=101  --seed=11
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
const EVENT_ID = (args.get("event") ?? process.env.EVENT_ID ?? "").trim();
const NO_SHOW_PCT = Math.min(50, Math.max(0, Number(args.get("no-show") ?? process.env.NO_SHOW_PCT ?? 8)));
const BIB_START = Number(args.get("bib-start") ?? process.env.BIB_START ?? 101);
const SEED = Number(args.get("seed") ?? process.env.SEED ?? 11);
const CONFIRM = process.env.CONFIRM === "CHECKIN" || args.get("confirm") === "true";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  if (!SUPABASE_URL) die("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!SERVICE_KEY) die("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!EVENT_ID) die("Pass --event=<event uuid>");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: entries, error } = await supabase
    .from("entries")
    .select("id,user_id,email,first_name,last_name,assigned_bib,kiosk_checked_in_at,distance_id")
    .eq("event_id", EVENT_ID);
  if (error) die(`entries query: ${error.message}`);
  if (!entries?.length) die("No entries for this event.");

  // Group entries per runner (user_id, falling back to email) — one bib per human.
  const byRunner = new Map();
  for (const e of entries) {
    const key = e.user_id ?? `em:${(e.email ?? "").toLowerCase()}`;
    const list = byRunner.get(key) ?? [];
    list.push(e);
    byRunner.set(key, list);
  }

  const rand = mulberry32(SEED);
  const runners = [...byRunner.values()];

  // Existing bibs (manual check-ins) must not collide with assigned ones.
  const usedBibs = new Set(
    entries.map((e) => (e.assigned_bib ?? "").trim()).filter((b) => b !== ""),
  );
  let nextBib = BIB_START;
  const takeBib = () => {
    while (usedBibs.has(String(nextBib))) nextBib += 1;
    usedBibs.add(String(nextBib));
    return String(nextBib++);
  };

  const plans = [];
  let alreadyChecked = 0;
  let noShows = 0;
  for (const list of runners) {
    const allChecked = list.every((e) => e.kiosk_checked_in_at);
    if (allChecked) {
      alreadyChecked += 1;
      continue;
    }
    if (rand() * 100 < NO_SHOW_PCT) {
      noShows += 1;
      continue;
    }
    const existingBib = list.map((e) => (e.assigned_bib ?? "").trim()).find((b) => b !== "");
    plans.push({ entries: list.filter((e) => !e.kiosk_checked_in_at), bib: existingBib || takeBib() });
  }

  console.log("=== CHECK-IN PREVIEW ===");
  console.log(`Runners on event: ${runners.length} | Already fully checked in: ${alreadyChecked}`);
  console.log(`Will check in: ${plans.length} runners (${plans.reduce((s, p) => s + p.entries.length, 0)} entries)`);
  console.log(`No-shows left behind: ${noShows} (${NO_SHOW_PCT}%)`);
  console.log(`Race-day bibs from: ${BIB_START}`);

  if (!CONFIRM) {
    console.log("\nPreview only. Re-run with -- --confirm to execute.");
    return;
  }

  console.log("\n=== CHECKING IN ===");
  let updated = 0;
  for (const plan of plans) {
    for (const e of plan.entries) {
      const { error: upErr } = await supabase
        .from("entries")
        .update({ kiosk_checked_in_at: new Date().toISOString(), assigned_bib: plan.bib })
        .eq("id", e.id);
      if (upErr) {
        console.error(`  ${e.first_name} ${e.last_name}: ${upErr.message}`);
        continue;
      }
      updated += 1;
    }
  }
  console.log(`Entries checked in: ${updated}. No-shows: ${noShows} runners stayed home.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
