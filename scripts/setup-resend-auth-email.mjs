#!/usr/bin/env node
/**
 * One-shot setup: register peerracing.com in Resend, add DNS in Cloudflare, push Supabase SMTP.
 *
 * Required in .env.local:
 *   RESEND_ADMIN_API_KEY=re_...   (full access — resend.com/api-keys)
 *
 * Optional (auto DNS):
 *   CLOUDFLARE_API_TOKEN=...      (Zone.DNS Edit on peerracing.com)
 *
 * Usage:
 *   node --env-file=.env.local scripts/setup-resend-auth-email.mjs
 *   node --env-file=.env.local scripts/setup-resend-auth-email.mjs --push
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DOMAIN = "peerracing.com";
const SENDER = "noreply@peerracing.com";
const CONFIG_PATH = join(ROOT, "supabase", "config.toml");

const adminKey = process.env.RESEND_ADMIN_API_KEY?.trim();
const cfToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const push = process.argv.includes("--push");

if (!adminKey) {
  console.error(
    "Missing RESEND_ADMIN_API_KEY — create a full-access key at https://resend.com/api-keys",
  );
  console.error("Add to .env.local, then re-run this script.");
  process.exit(1);
}

async function resend(path, init = {}) {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message ?? body.error ?? res.statusText);
  }
  return body;
}

async function cloudflare(path, init = {}) {
  if (!cfToken) return null;
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!body.success) {
    throw new Error(body.errors?.[0]?.message ?? "Cloudflare API error");
  }
  return body.result;
}

function recordName(fullName) {
  if (fullName === DOMAIN || fullName === "@") return DOMAIN;
  if (fullName.endsWith(`.${DOMAIN}`)) {
    return fullName.slice(0, -(DOMAIN.length + 1));
  }
  return fullName;
}

function normalizeValue(type, value) {
  if (type === "TXT") {
    return value.replace(/^"|"$/g, "");
  }
  if (type === "CNAME") {
    return value.replace(/\.$/, "");
  }
  return value;
}

async function ensureCloudflareRecords(records) {
  if (!cfToken) {
    console.log("\nTip: set CLOUDFLARE_API_TOKEN in .env.local to auto-add DNS records.\n");
    return;
  }

  const zones = await cloudflare(`/zones?name=${DOMAIN}`);
  const zone = zones?.[0];
  if (!zone?.id) {
    throw new Error(`Cloudflare zone not found for ${DOMAIN}`);
  }

  console.log(`\nCloudflare zone ${zone.id} — syncing ${records.length} records...\n`);

  for (const record of records) {
    const type = record.type;
    const name = recordName(record.name);
    const content = normalizeValue(type, record.value);
    const existing = await cloudflare(
      `/zones/${zone.id}/dns_records?type=${type}&name=${encodeURIComponent(record.name === DOMAIN ? DOMAIN : record.name)}`,
    );
    const match = (existing ?? []).find((r) => r.content === content || r.content === record.value.replace(/\.$/, ""));

    if (match) {
      console.log(`  skip ${type} ${name} (exists)`);
      continue;
    }

    await cloudflare(`/zones/${zone.id}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type,
        name,
        content,
        ttl: 1,
        proxied: false,
      }),
    });
    console.log(`  added ${type} ${name}`);
  }
}

function updateConfigSender() {
  let config = readFileSync(CONFIG_PATH, "utf8");
  config = config.replace(/admin_email\s*=\s*"[^"]*"/, `admin_email = "${SENDER}"`);
  writeFileSync(CONFIG_PATH, config);
  console.log(`Updated ${CONFIG_PATH} admin_email -> ${SENDER}`);
}

async function verifyDomain(domainId) {
  await resend(`/domains/${domainId}/verify`, { method: "POST" });
}

async function main() {
  const list = await resend("/domains");
  let domain = (list.data ?? []).find((d) => d.name === DOMAIN);

  if (!domain) {
    console.log(`Adding ${DOMAIN} to Resend...`);
    domain = await resend("/domains", {
      method: "POST",
      body: JSON.stringify({ name: DOMAIN, region: "us-east-1" }),
    });
  } else {
    console.log(`Domain in Resend: ${domain.id} (${domain.status})`);
    domain = await resend(`/domains/${domain.id}`);
  }

  const records = domain.records ?? [];
  console.log("\n--- DNS records for peerracing.com ---\n");
  for (const record of records) {
    console.log(
      `${record.type.padEnd(6)} ${String(record.name).padEnd(40)} -> ${record.value}`,
    );
  }

  await ensureCloudflareRecords(records);

  if (domain.status !== "verified") {
    console.log("\nTriggering Resend verification check...");
    await verifyDomain(domain.id);
    await new Promise((r) => setTimeout(r, 5000));
    domain = await resend(`/domains/${domain.id}`);
  }

  console.log(`\nDomain status: ${domain.status}`);

  if (domain.status !== "verified") {
    console.log("DNS may still be propagating. Re-run with --push once Resend shows verified.");
    if (!push) process.exit(0);
    process.exit(1);
  }

  console.log("Domain verified.");
  updateConfigSender();

  if (push) {
    execSync("npx supabase config push --yes", {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        RESEND_API_KEY: process.env.RESEND_API_KEY ?? adminKey,
      },
    });
    console.log("Supabase auth SMTP config pushed.");
  } else {
    console.log("\nRun again with --push to update Supabase SMTP after verification.");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
