import { execSync } from "node:child_process";
import fs from "node:fs";

const envPath = new URL("../.env.local", import.meta.url);
const text = fs.readFileSync(envPath, "utf8");
const env = {};

for (const line of text.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

const vars = [
  ["STRIPE_SECRET_KEY", true],
  ["STRIPE_WEBHOOK_SECRET", true],
  ["STRIPE_PRICE_MEMBERSHIP_ANNUAL", false],
  ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", false],
  ["STRIPE_PRICE_TOP_TIER_ANNUAL", false],
];

for (const [name, sensitive] of vars) {
  const value = env[name]?.trim();
  if (!value) {
    console.log(`skip (missing local): ${name}`);
    continue;
  }
  const args = [
    "vercel",
    "env",
    "add",
    name,
    "production",
    "--value",
    value,
    "--force",
    "--yes",
  ];
  if (sensitive) args.push("--sensitive");
  execSync(`npx ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
    stdio: "inherit",
    shell: true,
  });
  console.log(`updated: ${name}`);
}
