/**
 * Generate realistic timing-company CSVs for the race-weekend rehearsal — one
 * file per distance, containing only checked-in runners (you can't finish a race
 * you never started).
 *
 * Uses the "best case" headers: assigned_bib,pr_id,first_name,last_name,finish_time
 * Lognormal ability spread with a couple of elites and walkers, plus deliberate
 * landmines so the import review screen earns its keep:
 *   - one DNF row
 *   - one row with a mangled bib (forces PR ID / name matching)
 *   - one unregistered runner (bandit) by name only
 *   - ~4% of starters produce no row at all (course drop-outs)
 *
 * Usage:  npm run test-race:times -- --event=<uuid>
 * Options: --seed=23  --out=scripts/test-race/out
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
const SEED = Number(args.get("seed") ?? process.env.SEED ?? 23);
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
  if (!EVENT_ID) die("Pass --event=<event uuid>");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: distances, error: dErr } = await supabase
    .from("distances")
    .select("id,label")
    .eq("event_id", EVENT_ID);
  if (dErr || !distances?.length) die("No distances for this event.");

  const { data: entries, error: eErr } = await supabase
    .from("entries")
    .select("id,user_id,first_name,last_name,assigned_bib,distance_id,kiosk_checked_in_at,entry_type,source_entry_id")
    .eq("event_id", EVENT_ID)
    .not("kiosk_checked_in_at", "is", null);
  if (eErr) die(`entries query: ${eErr.message}`);
  if (!entries?.length) die("No checked-in entries — run check-in first.");

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
  const randNormal = () => {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const kmByDistance = new Map(distances.map((d) => [d.id, kmFromLabel(d.label)]));

  // Pass 1: primary entries run their own race -> generated seconds by entry id.
  const secondsByEntry = new Map(); // entry id -> seconds | null (drop-out)
  for (const dist of distances) {
    const primaries = entries.filter((e) => e.distance_id === dist.id && e.entry_type !== "roll_over");
    const km = kmByDistance.get(dist.id);
    // ~5:30/km median recreational pace, lognormal spread; slight fatigue factor on distance.
    const medianSeconds = km * 330 * (1 + km / 250);
    primaries.forEach((e, i) => {
      // ~4% start but never finish (no row in the timing file at all).
      if (rand() < 0.04 && i > 2) {
        secondsByEntry.set(e.id, null);
        return;
      }
      let seconds = medianSeconds * Math.exp(0.18 * randNormal());
      if (i === 0) seconds = medianSeconds * 0.62; // an elite
      if (i === primaries.length - 1) seconds = medianSeconds * 1.9; // a walker
      secondsByEntry.set(e.id, seconds);
    });
  }

  const entryById = new Map(entries.map((e) => [e.id, e]));

  for (const dist of distances) {
    const field = entries.filter((e) => e.distance_id === dist.id);
    if (field.length === 0) {
      console.log(`${dist.label}: no checked-in entries, skipping.`);
      continue;
    }

    const rows = [];
    let dropOuts = 0;
    let rollOvers = 0;
    for (const e of field) {
      let seconds;
      if (e.entry_type === "roll_over" && e.source_entry_id) {
        // Split from the qualifier run: scale source time by distance ratio,
        // slightly faster pace early in the race (~3%).
        const srcSeconds = secondsByEntry.get(e.source_entry_id);
        const src = entryById.get(e.source_entry_id);
        if (srcSeconds == null || !src) {
          dropOuts += 1; // source runner never finished -> no split either
          continue;
        }
        const ratio = (kmByDistance.get(dist.id) ?? 5) / (kmByDistance.get(src.distance_id) ?? 10);
        seconds = srcSeconds * ratio * 0.97;
        rollOvers += 1;
      } else {
        seconds = secondsByEntry.get(e.id);
        if (seconds == null) {
          dropOuts += 1;
          continue;
        }
      }
      rows.push({
        bib: e.assigned_bib ?? "",
        pr_id: (e.user_id && prIdByUser.get(e.user_id)) || "",
        first: e.first_name,
        last: e.last_name,
        time: fmtTime(seconds),
        seconds,
      });
    }

    rows.sort((a, b) => a.seconds - b.seconds);

    // Landmines for the review screen.
    if (rows.length >= 3) {
      rows[1] = { ...rows[1], bib: `X${rows[1].bib}9`, pr_id: "" }; // mangled bib -> falls to name match
      rows.push({ bib: rows[2].bib, pr_id: rows[2].pr_id, first: rows[2].first, last: rows[2].last, time: "DNF" });
    }
    const banditSeconds = (rows[Math.floor(rows.length / 2)]?.seconds ?? 1800) * 1.1;
    rows.push({ bib: "", pr_id: "", first: "Barry", last: "Bandit", time: fmtTime(banditSeconds) }); // unregistered

    const lines = ["assigned_bib,pr_id,first_name,last_name,finish_time"];
    for (const r of rows) {
      lines.push([r.bib, r.pr_id, r.first, r.last, r.time].map((v) => String(v)).join(","));
    }

    const file = path.join(OUT_DIR, `times-${dist.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`);
    fs.writeFileSync(file, lines.join("\r\n") + "\r\n");
    console.log(
      `${dist.label}: ${rows.length} rows -> ${file} (field ${field.length}, roll-over splits ${rollOvers}, drop-outs ${dropOuts}, +1 mangled bib, +1 DNF, +1 bandit)`,
    );
  }

  console.log("\nUpload each CSV at: event -> Results console -> Import finish times.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
