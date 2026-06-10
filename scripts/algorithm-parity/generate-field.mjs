// Generates a deterministic 100-runner field (field.csv) for the algorithm parity test:
// realistic long-race times, elites and walkers at the ends, mixed sex/age/military.
// Usage: node scripts/algorithm-parity/generate-field.mjs [count] [seed]

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const count = Number(process.argv[2] ?? 100);
const seed = Number(process.argv[3] ?? 42);

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(seed);
const randNormal = () => {
  // Box-Muller
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const FIRST = ["Avery", "Blake", "Casey", "Drew", "Emery", "Finley", "Gray", "Harper", "Indy", "Jordan", "Kai", "Logan", "Morgan", "Nico", "Oakley", "Parker", "Quinn", "Riley", "Sage", "Taylor"];
const LAST = ["Adams", "Brooks", "Carter", "Diaz", "Ellis", "Foster", "Garcia", "Hayes", "Irwin", "James", "Kelly", "Lopez", "Mason", "Nguyen", "Ortiz", "Price", "Reed", "Smith", "Torres", "Walsh"];

function fmtTime(totalSeconds) {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const rows = [["PRid", "BIB#", "First Name", "Last Name", "Age", "Sex", "Finish Time", "Military"]];

for (let i = 0; i < count; i++) {
  // Log-normal-ish long-race times centered around ~2.2 hours.
  let hours = 2.2 * Math.exp(0.22 * randNormal());
  if (i < 2) hours = 1.15 + 0.05 * rand(); // elites
  if (i >= count - 3) hours = 5.2 + 0.8 * rand(); // walkers / outliers
  const seconds = Math.max(3600, Math.round(hours * 3600));

  const age = 16 + Math.floor(rand() * 62);
  const sex = rand() < 0.48 ? "F" : "M";
  const military = rand() < 0.15 ? "1" : "0";

  rows.push([
    `PR${String(i + 1).padStart(4, "0")}`,
    String(100 + i),
    FIRST[Math.floor(rand() * FIRST.length)],
    LAST[Math.floor(rand() * LAST.length)],
    String(age),
    sex,
    fmtTime(seconds),
    military,
  ]);
}

const csv = rows.map((r) => r.join(",")).join("\n") + "\n";
const outPath = join(here, "field.csv");
writeFileSync(outPath, csv);
console.log(`wrote ${count} runners to ${outPath} (seed ${seed})`);
