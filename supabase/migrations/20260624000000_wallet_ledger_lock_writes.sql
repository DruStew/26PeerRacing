-- Tighten wallet_ledger writes to service-role code paths only.
--
-- The MVP RLS migration (20260214123500) created `wallet_ledger_insert_admin`,
-- which let any authenticated admin INSERT ledger rows directly from the client.
-- All money movement now flows through controlled server paths (race payouts,
-- entry debits via wallet_apply_debit_for_race_entry, withdrawals, adjustments)
-- under the service role, which bypasses RLS. Drop the client insert path so the
-- ledger has a single, auditable writer and no row can be minted from a browser.

drop policy if exists wallet_ledger_insert_admin on public.wallet_ledger;

-- Read-your-own stays in place (wallet_ledger_select_own). No INSERT/UPDATE/DELETE
-- policies remain for `authenticated`, so the service role is the only writer.

notify pgrst, 'reload schema';
