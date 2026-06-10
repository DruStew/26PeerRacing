// Full parity sweep: generates fields of several sizes/seeds, runs the original
// Python program and the TypeScript port on each, and diffs the outputs.
// Usage: npm run algo:parity   (or: node scripts/algorithm-parity/run-parity.mjs)

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const venvPython = join(here, ".venv", "Scripts", "python.exe");
const python = existsSync(venvPython) ? venvPython : "py";

// Sizes span the auto payout-slot brackets (4..12 slots) and keep incentive
// subsets large enough to be statistically meaningful, like a real field.
const SIZES = [50, 75, 100, 160, 250, 400];
const SEEDS = [1, 7, 42];

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();
}

let passes = 0;
const failures = [];

for (const size of SIZES) {
  for (const seed of SEEDS) {
    const label = `${size} runners / seed ${seed}`;
    run("node", [join(here, "generate-field.mjs"), String(size), String(seed)]);
    run(python, [join(here, "driver.py")]);
    run("node", [join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), join(here, "run-ts.ts")]);
    try {
      const out = run("node", [join(here, "compare.mjs")]);
      console.log(`PASS  ${label}  (${out.split("\n")[0]})`);
      passes++;
    } catch {
      console.log(`FAIL  ${label}`);
      failures.push(label);
    }
  }
}

console.log(`\n${passes}/${SIZES.length * SEEDS.length} parity runs passed`);
if (failures.length > 0) {
  console.log("failures:", failures.join("; "));
  process.exit(1);
}
