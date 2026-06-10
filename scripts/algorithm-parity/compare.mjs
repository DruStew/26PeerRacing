// Diffs python-output.json vs ts-output.json. Discrete results (division ranks,
// payouts, winner lists) must match exactly; raw floats (division boundaries in
// hours, finance subtotals) tolerate last-bit drift between libm implementations.
// Usage: node scripts/algorithm-parity/compare.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const py = JSON.parse(readFileSync(join(here, "python-output.json"), "utf8"));
const ts = JSON.parse(readFileSync(join(here, "ts-output.json"), "utf8"));

const REL_TOL = 1e-9;
const failures = [];
let floatDrift = 0;
let checked = 0;

function numbersClose(a, b) {
  if (a === b) return { ok: true, exact: true };
  const diff = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-300);
  return { ok: diff / scale < REL_TOL || diff < 1e-12, exact: false };
}

function diff(a, b, path) {
  checked++;
  if (typeof a === "number" && typeof b === "number") {
    const { ok, exact } = numbersClose(a, b);
    if (!ok) failures.push(`${path}: python=${a} ts=${b}`);
    else if (!exact) floatDrift++;
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      failures.push(`${path}: array length python=${a.length} ts=${b.length}`);
      return;
    }
    a.forEach((v, i) => diff(v, b[i], `${path}[${i}]`));
    return;
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) failures.push(`${path}.${k}: missing in python output`);
      else if (!(k in b)) failures.push(`${path}.${k}: missing in ts output`);
      else diff(a[k], b[k], `${path}.${k}`);
    }
    return;
  }
  if (a !== b) failures.push(`${path}: python=${JSON.stringify(a)} ts=${JSON.stringify(b)}`);
}

diff(py, ts, "$");

console.log(`compared ${checked} values; ${floatDrift} with sub-tolerance float drift`);
if (failures.length === 0) {
  console.log("PARITY PASS — TypeScript port matches the Python program.");
} else {
  console.log(`PARITY FAIL — ${failures.length} mismatch(es):`);
  for (const f of failures.slice(0, 50)) console.log("  " + f);
  if (failures.length > 50) console.log(`  ... and ${failures.length - 50} more`);
  process.exit(1);
}
