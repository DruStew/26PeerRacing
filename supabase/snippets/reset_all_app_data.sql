-- =============================================================================
-- RESET ALL APP DATA – run in Supabase SQL Editor (Snippets)
-- =============================================================================
-- Deletes all app data so you can start from scratch. Runs in dependency order
-- so foreign keys are satisfied. Does NOT delete auth.users (you must remove
-- users in Dashboard → Authentication → Users, or they will remain and can
-- log in again; new sign-ups will get new profile/roles/entries).
-- =============================================================================

-- 1. Overrides (reference entries, events)
delete from overrides;

-- 2. Results and raw results (reference entries, events)
delete from results;
delete from results_raw;

-- 3. Badges (reference entries, events, users)
delete from badges;

-- 4. Entries (reference events, distances, users)
delete from entries;

-- 5. Distance roll-over links (reference distances)
delete from distance_roll_over_sources;

-- 6. Distances (reference events)
delete from distances;

-- 7. Sidepots (reference events)
delete from sidepots;

-- 8. Events (reference users as promoter_id)
delete from events;

-- 9. Wallet ledger (reference users)
delete from wallet_ledger;

-- 10. Roles (reference users)
delete from roles;

-- 11. Profiles (reference users)
delete from profiles;

-- 12. Memberships (reference users)
delete from memberships;

-- =============================================================================
-- Auth users are NOT deleted by this script.
-- To remove sign-in accounts: Dashboard → Authentication → Users → delete each.
-- =============================================================================
