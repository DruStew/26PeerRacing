-- =============================================================================
-- Delete all auth users EXCEPT one account (by email) — dev / retest bulk import
-- =============================================================================
-- Run in Supabase SQL Editor. DESTRUCTIVE. Read the whole file before running.
--
-- 1) Set KEEP_EMAIL to the account you want to keep (yours).
-- 2) This removes other users' entries, memberships, profiles, roles, wallet rows,
--    and events promoted by anyone other than the keeper (so FKs are satisfied).
-- 3) Finally deletes other auth.users rows.
--
-- If you need events created by another promoter, transfer or export them first.
-- =============================================================================

do $$
declare
  keep_email constant text := 'drujstew@gmail.com';  -- <-- change if needed
  keep_id uuid;
begin
  select id into keep_id from auth.users where lower(email) = lower(trim(keep_email));
  if keep_id is null then
    raise exception 'No auth.users row for email: %', keep_email;
  end if;

  -- Dependent rows that reference entries (results does not cascade on entry delete)
  delete from results
  where entry_id in (select id from public.entries where user_id is distinct from keep_id);

  delete from badges
  where entry_id in (select id from public.entries where user_id is distinct from keep_id)
     or (user_id is not null and user_id is distinct from keep_id);

  delete from public.overrides
  where entry_id in (select id from public.entries where user_id is distinct from keep_id)
     or (created_by is not null and created_by is distinct from keep_id);

  update public.entries
  set pacer_user_id = null
  where pacer_user_id is not null and pacer_user_id is distinct from keep_id;

  delete from public.entries where user_id is distinct from keep_id;

  delete from public.wallet_ledger where user_id is distinct from keep_id;

  delete from public.roles where user_id is distinct from keep_id;

  delete from public.membership_benefits where user_id is distinct from keep_id;

  delete from public.memberships where user_id is distinct from keep_id;

  delete from public.profiles where id is distinct from keep_id;

  -- Events promoted by accounts we are about to remove (cascades distances, sidepots, etc.)
  delete from public.events where promoter_id is distinct from keep_id;

  delete from auth.users where id is distinct from keep_id;
end $$;

-- =============================================================================
-- Done. Only the keeper email should remain under Authentication → Users.
-- =============================================================================
