-- =============================================================================
-- FULL RESET – app data + auth users (run in Supabase SQL Editor)
-- =============================================================================
-- Use this to wipe everything so you can test from scratch: promoter signup,
-- create event, user signup, profile complete, membership, enter race, pacer.
-- Runs in dependency order. Auth users are deleted last.
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

-- 12. Membership benefits (reference users)
delete from membership_benefits;

-- 13. Memberships (reference users)
delete from memberships;

-- 14. Auth users (sign-in accounts) – you will need to sign up again
delete from auth.users;

-- =============================================================================
-- Done. Sign up again and go through: profile complete → membership welcome
-- → create event (promoter) or enter race / pacer (member).
-- =============================================================================
