/**
 * Generate a CLEAN race-results CSV per distance for an event — every entry gets a
 * finish time, spread evenly from elites to walkers (no landmines, no drop-outs).
 *
 * Best-case upload headers: assigned_bib,pr_id,first_name,last_name,finish_time
 * Match priority on import is assigned_bib -> pr_id -> bib -> name, so we emit the
 * race-day bib when present and always the PR ID for members.
 *
 * Usage:
 *   npm run test-race:results -- --event=<uuid>
 *   npm run test-race:results            (defaults to the "Test: 10K-5K" rehearsal event)
 * Options: --seed=7  --out=scripts/test-race/out
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  }),
);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_ID = (args.get("event") ?? process.env.EVENT_ID ?? "").trim();
const EVENT_NAME = (args.get("name") ?? "Test: 10K-5k").trim();
const SEED = Number(args.get("seed") ?? process.env.SEED ?? 7);
const OUT_DIR = args.get("out") ?? process.env.OUT_DIR ?? path.join("scripts", "test-race", "out");

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

/** Rough km from a distance label: "10K" -> 10, "5k" -> 5, "Half Marathon" -> 21.1. */
function kmFromLabel(label) {
  const l = label.toLowerCase();
  if (l.includes("marathon")) return l.includes("half") ? 21.1 : 42.2;
  const m = l.match(/(\d+(?:\.\d+)?)\s*k/);
  if (m) return Number(m[1]);
  const mi = l.match(/(\d+(?:\.\d+)?)\s*mi/);
  if (mi) return Number(mi[1]) * 1.609;
  return 10;
}

function fmtTime(totalSeconds) {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

async function main() {
  if (!SUPABASE_URL) die("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!SERVICE_KEY) die("Missing SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let eventId = EVENT_ID;
  if (!eventId) {
    const { data: ev } = await supabase.from("events").select("id,name").ilike("name", `%${EVENT_NAME}%`);
    if (!ev?.length) die(`No event matching "${EVENT_NAME}". Pass --event=<uuid>.`);
    eventId = ev[0].id;
    console.log(`Event: ${ev[0].name} (${eventId})`);
  }

  const { data: distances, error: dErr } = await supabase
    .from("distances")
    .select("id,label")
    .eq("event_id", eventId);
  if (dErr || !distances?.length) die("No distances for this event.");

  // ALL entries — checked in or not.
  const { data: entries, error: eErr } = await supabase
    .from("entries")
    .select("id,user_id,first_name,last_name,assigned_bib,bib,distance_id")
    .eq("event_id", eventId);
  if (eErr) die(`entries query: ${eErr.message}`);
  if (!entries?.length) die("No entries for this event.");

  const userIds = [...new Set(entries.map((e) => e.user_id).filter(Boolean))];
  const prIdByUser = new Map();
  for (let i = 0; i < userIds.length; i += 500) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,pr_id")
      .in("id", userIds.slice(i, i + 500));
    for (const p of profiles ?? []) {
      if (p.pr_id) prIdByUser.set(p.id, p.pr_id);
    }
  }

  const rand = mulberry32(SEED);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const dist of distances) {
    const field = entries.filter((e) => e.distance_id === dist.id);
    if (field.length === 0) {
      console.log(`${dist.label}: no entries, skipping.`);
      continue;
    }
    const km = kmFromLabel(dist.label);

    // Completely random ability per entry: uniform pace from elite (~3:05/km) to
    // walker (~12:30/km), so the field is genuinely all over the board.
    const FAST_PACE = 185; // sec/km — elite
    const SLOW_PACE = 750; // sec/km — walker
    const rows = field.map((e) => {
      const ability = rand(); // 0 = fastest, 1 = slowest
      const pace = FAST_PACE + ability * (SLOW_PACE - FAST_PACE);
      const jitter = 0.97 + rand() * 0.06; // ±3% noise
      const seconds = pace * km * jitter;
      return {
        bib: e.assigned_bib ?? "",
        pr_id: (e.user_id && prIdByUser.get(e.user_id)) || "",
        first: e.first_name ?? "",
        last: e.last_name ?? "",
        time: fmtTime(seconds),
        seconds,
      };
    });

    rows.sort((a, b) => a.seconds - b.seconds);

    const lines = ["assigned_bib,pr_id,first_name,last_name,finish_time"];
    for (const r of rows) {
      lines.push([r.bib, r.pr_id, r.first, r.last, r.time].map((v) => String(v)).join(","));
    }

    const file = path.join(OUT_DIR, `results-${dist.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`);
    fs.writeFileSync(file, lines.join("\r\n") + "\r\n");
    console.log(
      `${dist.label}: ${rows.length} rows -> ${file} (fastest ${rows[0].time}, slowest ${rows[rows.length - 1].time})`,
    );
  }

  console.log("\nUpload each CSV at: event -> Results console -> Import finish times.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
