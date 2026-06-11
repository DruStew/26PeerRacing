/**
 * Wipe all test data while preserving staff accounts.
 *
 * Deletes: every event (cascades distances, entries, results, badges, payout
 * settings, kiosk config, sidepots, roll-overs, pending Stripe entries) and every
 * auth user EXCEPT keepers (cascades profiles, roles, memberships, wallet, etc).
 * Keepers = users holding a promoter/admin role, plus KEEP_EMAILS.
 *
 * Stripe test-mode objects are untouched (clear in the Stripe dashboard if desired).
 *
 * Preview (default):  npm run test-race:wipe
 * Execute:            npm run test-race:wipe -- --confirm
 * Extra keepers:      npm run test-race:wipe -- --keep=a@b.com,c@d.com
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
const CONFIRM = process.env.CONFIRM === "WIPE" || args.get("confirm") === "true";
const KEEP_EMAILS = (args.get("keep") ?? process.env.KEEP_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

async function listAllUsers(supabase) {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...(data.users ?? []));
    if ((data.users ?? []).length < 1000) break;
    page += 1;
  }
  return users;
}

async function main() {
  if (!SUPABASE_URL) die("Missing NEXT_PUBLIC_SUPABASE_URL (run via npm script with --env-file=.env.local)");
  if (!SERVICE_KEY) die("Missing SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Keepers: anyone with a promoter/admin role + KEEP_EMAILS.
  const { data: staffRoles, error: rolesErr } = await supabase
    .from("roles")
    .select("user_id,role")
    .in("role", ["promoter", "admin"]);
  if (rolesErr) die(`roles query: ${rolesErr.message}`);

  const allUsers = await listAllUsers(supabase);
  const keepIds = new Set((staffRoles ?? []).map((r) => r.user_id));
  for (const u of allUsers) {
    if (u.email && KEEP_EMAILS.includes(u.email.toLowerCase())) keepIds.add(u.id);
  }

  const keepers = allUsers.filter((u) => keepIds.has(u.id));
  const goners = allUsers.filter((u) => !keepIds.has(u.id));

  const { data: events } = await supabase.from("events").select("id,name,race_date").order("race_date");
  const countOf = async (table) => {
    const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
    return count ?? 0;
  };

  console.log("=== WIPE PREVIEW ===");
  console.log(`Events to delete: ${(events ?? []).length}`);
  for (const e of events ?? []) console.log(`  - ${e.name} (${e.race_date})  ${e.id}`);
  console.log(
    `Entries: ${await countOf("entries")} | Results: ${await countOf("results")} | Results raw: ${await countOf("results_raw")} | Badges: ${await countOf("badges")} | Wallet rows: ${await countOf("wallet_ledger")}`,
  );
  console.log(`Auth users total: ${allUsers.length}`);
  console.log(`KEEPING ${keepers.length} user(s):`);
  for (const u of keepers) console.log(`  - ${u.email ?? u.id}`);
  console.log(`DELETING ${goners.length} user(s) (and their profiles/memberships/wallets via cascade)`);

  if (!CONFIRM) {
    console.log("\nPreview only — nothing deleted. Re-run with -- --confirm to execute.");
    return;
  }

  console.log("\n=== EXECUTING WIPE ===");

  const { error: evDelErr } = await supabase
    .from("events")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (evDelErr) die(`events delete: ${evDelErr.message}`);
  console.log("Events deleted (event-scoped data cascaded).");

  let deletedUsers = 0;
  for (const u of goners) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) {
      console.error(`  deleteUser ${u.email ?? u.id}: ${error.message}`);
      continue;
    }
    deletedUsers += 1;
    if (deletedUsers % 50 === 0) console.log(`  ...${deletedUsers}/${goners.length} users deleted`);
  }
  console.log(`Auth users deleted: ${deletedUsers}/${goners.length}`);

  // Test money for keepers is stale too — wallet starts clean.
  const { error: walletErr } = await supabase
    .from("wallet_ledger")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (walletErr) console.error(`wallet_ledger cleanup: ${walletErr.message}`);
  else console.log("Wallet ledger cleared (including keeper balances — test money).");

  console.log("\nDone. Database is clean; staff accounts preserved.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
