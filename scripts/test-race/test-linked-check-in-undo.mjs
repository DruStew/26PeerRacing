/**
 * Tests linked Carry-Over kiosk check-in / undo (RPC + optional HTTP API).
 *
 *   node --use-system-ca --env-file=.env.local scripts/test-race/test-linked-check-in-undo.mjs
 *   node --use-system-ca --env-file=.env.local scripts/test-race/test-linked-check-in-undo.mjs --event=<uuid>
 *   node --use-system-ca --env-file=.env.local scripts/test-race/test-linked-check-in-undo.mjs --api=http://localhost:3000
 */

import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  }),
);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_ID = (args.get("event") ?? process.env.EVENT_ID ?? "").trim();
const API_BASE = (args.get("api") ?? process.env.API_BASE ?? "").replace(/\/$/, "");

let passed = 0;
let failed = 0;

function die(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function ok(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  failed++;
  console.error(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

// --- carry-over-entry-group (mirrors lib/kiosk/carry-over-entry-group.ts) ---

function isCarryOverEntryLike(entry) {
  return entry.entry_type === "roll_over";
}

function carryOverLinkedEntries(entries, entryId) {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return [];
  const primaryId =
    isCarryOverEntryLike(entry) && entry.source_entry_id ? entry.source_entry_id : entry.id;
  const linked = entries.filter(
    (e) => e.id === primaryId || (isCarryOverEntryLike(e) && e.source_entry_id === primaryId),
  );
  return linked.length > 0 ? linked : [entry];
}

function hasCarryOverLink(entries, entryId) {
  return carryOverLinkedEntries(entries, entryId).length > 1;
}

function deriveKioskCode(eventId, localDate, generationVersion, kind) {
  const secret = process.env.EVENT_KIOSK_SECRET?.trim();
  if (!secret) throw new Error("EVENT_KIOSK_SECRET is not set");
  const h = createHmac("sha256", secret)
    .update(`${eventId}|${localDate}|${generationVersion}|${kind}`)
    .digest("hex");
  const n = Number.parseInt(h.slice(0, 12), 16) % 900_000;
  return String(100_000 + n);
}

function testGroupLogic() {
  console.log("\n1. Carry-Over group logic (unit)");
  const entries = [
    { id: "p1", entry_type: "primary", source_entry_id: null, distance_label: "Qualifier" },
    { id: "r1", entry_type: "roll_over", source_entry_id: "p1", distance_label: "5K Split" },
    { id: "p2", entry_type: "primary", source_entry_id: null, distance_label: "10K" },
  ];
  assert(hasCarryOverLink(entries, "p1"), "primary with split is linked");
  assert(hasCarryOverLink(entries, "r1"), "roll_over split is linked");
  assert(!hasCarryOverLink(entries, "p2"), "independent primary is not linked");
  assert(carryOverLinkedEntries(entries, "r1").length === 2, "split resolves to 2 entries");
  assert(carryOverLinkedEntries(entries, "p2").length === 1, "independent resolves to 1 entry");
}

async function fetchEntries(supabase, eventId, userId) {
  const { data, error } = await supabase
    .from("entries")
    .select("id,entry_type,source_entry_id,user_id,kiosk_checked_in_at,distance_id")
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function setCheckInState(supabase, ids, value) {
  const { error } = await supabase.from("entries").update({ kiosk_checked_in_at: value }).in("id", ids);
  if (error) throw new Error(error.message);
}

async function rpcConfirm(supabase, eventId, entryId) {
  const { data, error } = await supabase.rpc("kiosk_confirm_entry_check_in", {
    p_event_id: eventId,
    p_entry_id: entryId,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function rpcRevert(supabase, eventId, entryId) {
  const { data, error } = await supabase.rpc("kiosk_revert_entry_check_in", {
    p_event_id: eventId,
    p_entry_id: entryId,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

function allCheckedIn(rows) {
  return rows.every((r) => r.kiosk_checked_in_at);
}

function allUnchecked(rows) {
  return rows.every((r) => !r.kiosk_checked_in_at);
}

async function findLinkedPair(supabase, eventId) {
  let q = supabase
    .from("entries")
    .select("id,event_id,user_id,entry_type,source_entry_id,kiosk_checked_in_at,distance_id")
    .eq("entry_type", "roll_over")
    .not("source_entry_id", "is", null);
  if (eventId) q = q.eq("event_id", eventId);
  const { data: splits, error } = await q.limit(20);
  if (error) throw new Error(error.message);
  if (!splits?.length) return null;

  for (const split of splits) {
    const { data: primary } = await supabase
      .from("entries")
      .select("id,event_id,user_id,entry_type,source_entry_id,kiosk_checked_in_at,distance_id")
      .eq("id", split.source_entry_id)
      .eq("event_id", split.event_id)
      .maybeSingle();
    if (!primary || !split.user_id || primary.user_id !== split.user_id) continue;
    return {
      eventId: split.event_id,
      userId: split.user_id,
      primaryId: primary.id,
      splitId: split.id,
    };
  }
  return null;
}

async function findIndependentEntry(supabase, eventId, userId, excludeIds) {
  const rows = await fetchEntries(supabase, eventId, userId);
  const exclude = new Set(excludeIds);
  for (const e of rows) {
    if (exclude.has(e.id)) continue;
    if (e.entry_type === "roll_over") continue;
    const group = carryOverLinkedEntries(rows, e.id);
    if (group.length === 1) return e.id;
  }
  return null;
}

async function testRpcLinked(supabase, pair) {
  console.log(`\n2. Linked RPC (event ${pair.eventId.slice(0, 8)}…)`);
  const { eventId, userId, primaryId, splitId } = pair;

  const allIds = [primaryId, splitId];
  await setCheckInState(supabase, allIds, null);

  let rows = await rpcConfirm(supabase, eventId, primaryId);
  assert(rows.length === 2, "confirm primary returns 2 rows");
  const afterConfirmPrimary = await fetchEntries(supabase, eventId, userId);
  const linkedAfterPrimary = afterConfirmPrimary.filter((e) => allIds.includes(e.id));
  assert(allCheckedIn(linkedAfterPrimary), "confirm primary checks in both linked entries");

  rows = await rpcRevert(supabase, eventId, splitId);
  assert(rows.length === 2, "undo from split returns 2 rows");
  const afterUndoSplit = await fetchEntries(supabase, eventId, userId);
  const linkedAfterUndoSplit = afterUndoSplit.filter((e) => allIds.includes(e.id));
  assert(allUnchecked(linkedAfterUndoSplit), "undo from split clears both linked entries");

  rows = await rpcConfirm(supabase, eventId, splitId);
  assert(rows.length === 2, "confirm from split returns 2 rows");
  const afterConfirmSplit = await fetchEntries(supabase, eventId, userId);
  const linkedAfterConfirmSplit = afterConfirmSplit.filter((e) => allIds.includes(e.id));
  assert(allCheckedIn(linkedAfterConfirmSplit), "confirm from split checks in both linked entries");

  rows = await rpcRevert(supabase, eventId, primaryId);
  assert(rows.length === 2, "undo from primary returns 2 rows");
  const afterUndoPrimary = await fetchEntries(supabase, eventId, userId);
  const linkedAfterUndoPrimary = afterUndoPrimary.filter((e) => allIds.includes(e.id));
  assert(allUnchecked(linkedAfterUndoPrimary), "undo from primary clears both linked entries");

  await setCheckInState(supabase, allIds, null);
}

async function testRpcIndependent(supabase, eventId, userId, linkedIds) {
  console.log("\n3. Independent RPC (single entry only)");
  const independentId = await findIndependentEntry(supabase, eventId, userId, linkedIds);
  if (!independentId) {
    console.log("  (skip — no independent entry for same runner)");
    return;
  }

  await setCheckInState(supabase, [independentId], null);
  const linked = await fetchEntries(supabase, eventId, userId);
  const linkedOnly = linked.filter((e) => linkedIds.includes(e.id));
  await setCheckInState(supabase, linkedIds, null);

  const rows = await rpcConfirm(supabase, eventId, independentId);
  assert(rows.length === 1, "confirm independent returns 1 row");
  const after = await fetchEntries(supabase, eventId, userId);
  const ind = after.find((e) => e.id === independentId);
  const linkedStill = after.filter((e) => linkedIds.includes(e.id));
  assert(Boolean(ind?.kiosk_checked_in_at), "independent entry is checked in");
  assert(allUnchecked(linkedStill), "linked entries stay unchecked when confirming independent");

  await rpcRevert(supabase, eventId, independentId);
  const afterUndo = await fetchEntries(supabase, eventId, userId);
  const indAfter = afterUndo.find((e) => e.id === independentId);
  assert(!indAfter?.kiosk_checked_in_at, "independent undo clears only that entry");
}

async function testHttpApi(supabase, pair) {
  if (!API_BASE) {
    console.log("\n4. HTTP API (skip — pass --api=http://localhost:3000 to run)");
    return;
  }
  console.log(`\n4. HTTP API (${API_BASE})`);
  const { eventId, userId, primaryId, splitId } = pair;

  const { data: ev } = await supabase.from("events").select("status").eq("id", eventId).maybeSingle();
  if (ev?.status !== "published") {
    console.log("  (skip — event not published; kiosk session requires published status)");
    return;
  }

  const { data: kiosk } = await supabase
    .from("event_kiosk")
    .select("codes_for_local_date,generation_version")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!kiosk) {
    console.log("  (skip — no event_kiosk row)");
    return;
  }

  const k = kiosk;
  const code = deriveKioskCode(eventId, k.codes_for_local_date, k.generation_version, "kiosk");

  const sessionRes = await fetch(`${API_BASE}/api/kiosk/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, kioskCode: code }),
  });
  const sessionJson = await sessionRes.json();
  if (!sessionRes.ok || !sessionJson.ok) {
    fail("kiosk session login", sessionJson.error ?? sessionRes.statusText);
    return;
  }
  ok("kiosk session login");

  const cookie = sessionRes.headers.get("set-cookie");
  const prKiosk = cookie?.split(";").find((p) => p.trim().startsWith("pr_kiosk="));
  if (!prKiosk) {
    fail("pr_kiosk cookie received");
    return;
  }
  ok("pr_kiosk cookie received");

  await setCheckInState(supabase, [primaryId, splitId], null);

  const confirmRes = await fetch(`${API_BASE}/api/kiosk/check-in/entry`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: prKiosk.trim() },
    body: JSON.stringify({ eventId, entryId: primaryId, confirmCheckIn: true }),
  });
  const confirmJson = await confirmRes.json();
  assert(confirmRes.ok && confirmJson.ok, "PATCH confirmCheckIn");
  assert(Array.isArray(confirmJson.entries) && confirmJson.entries.length === 2, "API returns 2 entries on confirm");

  const undoRes = await fetch(`${API_BASE}/api/kiosk/check-in/entry`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: prKiosk.trim() },
    body: JSON.stringify({ eventId, entryId: splitId, undoCheckIn: true }),
  });
  const undoJson = await undoRes.json();
  assert(undoRes.ok && undoJson.ok, "PATCH undoCheckIn from split");
  assert(Array.isArray(undoJson.entries) && undoJson.entries.length === 2, "API returns 2 entries on undo");

  const afterUndo = await fetchEntries(supabase, eventId, userId);
  const linked = afterUndo.filter((e) => [primaryId, splitId].includes(e.id));
  assert(allUnchecked(linked), "HTTP undo clears both linked entries in DB");

  await setCheckInState(supabase, [primaryId, splitId], null);
}

async function main() {
  if (!SUPABASE_URL) die("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!SERVICE_KEY) die("Missing SUPABASE_SERVICE_ROLE_KEY");

  testGroupLogic();

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pair = await findLinkedPair(supabase, EVENT_ID);
  if (!pair) {
    die(
      EVENT_ID
        ? "No Carry-Over linked entries found for this event. Seed with test-race:seed or enter a runner with a Carry-Over split."
        : "No Carry-Over linked entries found. Pass --event=<uuid> after seeding test data.",
    );
  }

  console.log(`\nUsing runner ${pair.userId.slice(0, 8)}… primary=${pair.primaryId.slice(0, 8)}… split=${pair.splitId.slice(0, 8)}…`);

  try {
    await testRpcLinked(supabase, pair);
    await testRpcIndependent(supabase, pair.eventId, pair.userId, [pair.primaryId, pair.splitId]);
    await testHttpApi(supabase, pair);
  } catch (e) {
    die((e instanceof Error ? e.message : String(e)));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("\nAll linked check-in / undo tests passed.");
}

main();
