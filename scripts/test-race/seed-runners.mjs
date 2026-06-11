/**
 * Seed scripted race-weekend runners: real auth users + profiles + active
 * memberships + paid entries, spread across the event's distances.
 *
 * Field mix (exact quotas, not probabilities): half women; 25 military total of
 * which ~1/8 are women (3 women / 22 men). Ages 16-78. Distances are roll-over
 * aware: the qualifier gets primary entries; "both" runners get a primary on the
 * qualifier plus a roll_over entry on the target distance (source_entry_id set),
 * exactly like the real enter flow. PR IDs assigned from PR_ID_START (default
 * 5001) to stay clear of IDs handed out by the real signup flow.
 *
 * Preview:  npm run test-race:seed -- --event=<uuid>
 * Execute:  npm run test-race:seed -- --event=<uuid> --confirm
 * Options:  --count=90  --seed=7  --pr-id-start=5001
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
const COUNT = Math.max(1, Number(args.get("count") ?? process.env.COUNT ?? 90));
const SEED = Number(args.get("seed") ?? process.env.SEED ?? 7);
const PR_ID_START = Number(args.get("pr-id-start") ?? process.env.PR_ID_START ?? 5001);
const CONFIRM = process.env.CONFIRM === "SEED" || args.get("confirm") === "true";

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

const FIRST_M = ["James", "Marcus", "Tyler", "Derek", "Colin", "Andre", "Hank", "Luis", "Pete", "Omar", "Victor", "Wade", "Eli", "Russ", "Tom", "Jared", "Felix", "Gus", "Nate", "Boyd"];
const FIRST_F = ["Maria", "Jenna", "Carla", "Dana", "Elise", "Faith", "Gina", "Heidi", "Iris", "Joy", "Kara", "Lena", "Mona", "Nora", "Opal", "Page", "Rita", "Sara", "Tess", "Vera"];
const LAST = ["Anderson", "Baker", "Chavez", "Dalton", "Emerson", "Flores", "Griggs", "Holt", "Ibarra", "Jensen", "Knox", "Lujan", "Meyer", "Norris", "Owens", "Pruitt", "Quigley", "Ramos", "Stetson", "Truitt", "Ulrich", "Vance", "Wexler", "Yates", "Zorn"];

async function main() {
  if (!SUPABASE_URL) die("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!SERVICE_KEY) die("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!EVENT_ID) die("Pass --event=<event uuid> (from the event editor URL)");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("id,name,race_date,pr_cutoff")
    .eq("id", EVENT_ID)
    .single();
  if (evErr || !event) die(`Event not found: ${EVENT_ID}`);

  const { data: distances, error: dErr } = await supabase
    .from("distances")
    .select("id,label,pr_cutoff,entry_fee_cents,is_peer_racing_qualifier,allow_qualifier_split_to_roll_over_here")
    .eq("event_id", EVENT_ID);
  if (dErr || !distances?.length) die("Event has no distances — create them in the event editor first.");

  const rand = mulberry32(SEED);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Roll-over aware distances: qualifier takes primary entries; target takes
  // primary (5K-only runners) or roll_over (qualifier runners adding the split).
  const qualifier = distances.find((d) => d.is_peer_racing_qualifier) ?? distances[0];
  const rollTarget =
    distances.find((d) => d.id !== qualifier.id && d.allow_qualifier_split_to_roll_over_here) ??
    distances.find((d) => d.id !== qualifier.id) ??
    null;

  // Exact quotas: half women; MILITARY_TOTAL with ~1/8 women.
  const femaleTotal = Math.round(COUNT / 2);
  const MILITARY_TOTAL = Math.min(25, COUNT);
  const militaryWomen = Math.max(1, Math.round(MILITARY_TOTAL / 8));
  const militaryMen = MILITARY_TOTAL - militaryWomen;

  const sexes = shuffle([
    ...Array(femaleTotal).fill("female"),
    ...Array(COUNT - femaleTotal).fill("male"),
  ]);
  const femaleIdx = sexes.flatMap((s, i) => (s === "female" ? [i] : []));
  const maleIdx = sexes.flatMap((s, i) => (s === "male" ? [i] : []));
  const militarySet = new Set([
    ...shuffle([...femaleIdx]).slice(0, militaryWomen),
    ...shuffle([...maleIdx]).slice(0, militaryMen),
  ]);

  // Allocation: ~55% qualifier only, ~28% target only, ~17% both (roll-over).
  const allocations = shuffle([
    ...Array(Math.round(COUNT * 0.55)).fill("qualifier"),
    ...Array(Math.round(COUNT * 0.28)).fill("target"),
  ]);
  while (allocations.length < COUNT) allocations.push("both");

  const runners = [];
  for (let i = 0; i < COUNT; i++) {
    const female = sexes[i] === "female";
    const age = 16 + Math.floor(rand() * 63);
    const n = String(i + 1).padStart(3, "0");
    const dobYear = new Date().getFullYear() - age;
    const alloc = rollTarget ? allocations[i] : "qualifier";
    runners.push({
      first: female ? pick(FIRST_F) : pick(FIRST_M),
      last: pick(LAST),
      email: `pr.test.runner${n}@example.com`,
      phone: `555${String(2000000 + i)}`,
      dob: `${dobYear}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
      sex: female ? "female" : "male",
      military: militarySet.has(i),
      pr_id: String(PR_ID_START + i),
      alloc, // "qualifier" | "target" | "both"
    });
  }

  const counts = {
    qualifierPrimary: runners.filter((r) => r.alloc === "qualifier" || r.alloc === "both").length,
    targetPrimary: runners.filter((r) => r.alloc === "target").length,
    rollOvers: runners.filter((r) => r.alloc === "both").length,
  };
  const entryCount = counts.qualifierPrimary + counts.targetPrimary + counts.rollOvers;

  console.log("=== SEED PREVIEW ===");
  console.log(`Event: ${event.name} (${event.race_date})`);
  console.log(`Qualifier: ${qualifier.label} | Roll-over target: ${rollTarget?.label ?? "none"}`);
  console.log(`Runners: ${COUNT} | Entries: ${entryCount}`);
  console.log(`  ${qualifier.label} primary: ${counts.qualifierPrimary}`);
  if (rollTarget) {
    console.log(`  ${rollTarget.label} primary: ${counts.targetPrimary}`);
    console.log(`  ${rollTarget.label} roll-over (split from ${qualifier.label}): ${counts.rollOvers}`);
  }
  const fem = runners.filter((r) => r.sex === "female");
  console.log(
    `Female: ${fem.length} | Military: ${runners.filter((r) => r.military).length} (women: ${fem.filter((r) => r.military).length}, men: ${runners.filter((r) => r.military && r.sex === "male").length})`,
  );
  console.log(`PR IDs: ${PR_ID_START}-${PR_ID_START + COUNT - 1} | Emails: pr.test.runner001..${String(COUNT).padStart(3, "0")}@example.com`);

  if (!CONFIRM) {
    console.log("\nPreview only — nothing written. Re-run with -- --confirm to execute.");
    return;
  }

  console.log("\n=== SEEDING ===");
  const membershipEnd = new Date();
  membershipEnd.setFullYear(membershipEnd.getFullYear() + 1);

  let usersCreated = 0;
  let entriesInserted = 0;

  for (const r of runners) {
    const { data: created, error: userErr } = await supabase.auth.admin.createUser({
      email: r.email,
      email_confirm: true,
    });
    let userId = created?.user?.id ?? null;
    if (userErr) {
      const msg = String(userErr.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("duplicate") || userErr.status === 422) {
        // Re-running: resolve the existing user by email.
        const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        userId = (list?.users ?? []).find((u) => u.email?.toLowerCase() === r.email)?.id ?? null;
        if (!userId) die(`User exists but unresolved: ${r.email}`);
      } else {
        die(`createUser ${r.email}: ${userErr.message}`);
      }
    } else {
      usersCreated += 1;
    }

    const { error: profErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        first_name: r.first,
        last_name: r.last,
        email: r.email,
        phone: r.phone,
        dob: r.dob,
        sex: r.sex,
        active_or_retired_military: r.military,
        pr_id: r.pr_id,
      },
      { onConflict: "id" },
    );
    if (profErr) die(`profile ${r.email}: ${profErr.message}`);

    const { error: memErr } = await supabase.from("memberships").upsert(
      {
        user_id: userId,
        status: "active",
        membership_start_at: new Date().toISOString(),
        membership_end_at: membershipEnd.toISOString(),
        renewal_count: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (memErr) die(`membership ${r.email}: ${memErr.message}`);

    const baseEntry = (d) => ({
      event_id: EVENT_ID,
      user_id: userId,
      distance_id: d.id,
      first_name: r.first,
      last_name: r.last,
      phone: r.phone,
      email: r.email,
      dob: r.dob,
      sex: r.sex,
      bib: r.pr_id,
      entry_kind: "paid",
      paid_at: new Date().toISOString(),
      paid_amount_cents: d.entry_fee_cents ?? 0,
      cutoff_snapshot: new Date(d.pr_cutoff ?? event.pr_cutoff ?? Date.now()).toISOString(),
      eligible: true,
    });

    let qualifierEntryId = null;
    if (r.alloc === "qualifier" || r.alloc === "both") {
      const { data: ins, error: entErr } = await supabase
        .from("entries")
        .insert({ ...baseEntry(qualifier), entry_type: "primary", source_entry_id: null })
        .select("id")
        .single();
      if (entErr) {
        if (entErr.code !== "23505" && !String(entErr.message).includes("duplicate")) {
          die(`entry ${r.email} ${qualifier.label}: ${entErr.message}`);
        }
      } else {
        qualifierEntryId = ins.id;
        entriesInserted += 1;
      }
    }
    if (rollTarget && r.alloc === "target") {
      const { error: entErr } = await supabase
        .from("entries")
        .insert({ ...baseEntry(rollTarget), entry_type: "primary", source_entry_id: null });
      if (entErr) {
        if (entErr.code !== "23505" && !String(entErr.message).includes("duplicate")) {
          die(`entry ${r.email} ${rollTarget.label}: ${entErr.message}`);
        }
      } else {
        entriesInserted += 1;
      }
    }
    if (rollTarget && r.alloc === "both" && qualifierEntryId) {
      const { error: entErr } = await supabase
        .from("entries")
        .insert({ ...baseEntry(rollTarget), entry_type: "roll_over", source_entry_id: qualifierEntryId });
      if (entErr) {
        if (entErr.code !== "23505" && !String(entErr.message).includes("duplicate")) {
          die(`roll-over entry ${r.email} ${rollTarget.label}: ${entErr.message}`);
        }
      } else {
        entriesInserted += 1;
      }
    }

    await new Promise((res) => setTimeout(res, 60));
    if ((usersCreated + 1) % 25 === 0) console.log(`  ...${usersCreated} users so far`);
  }

  console.log(`Users created: ${usersCreated} | Entries inserted: ${entriesInserted}`);
  console.log("Done. Seeded runners are real members with active memberships and paid entries.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
