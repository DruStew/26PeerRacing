-- =============================================================================
-- GRANT PROMOTER OR ADMIN (run in Supabase SQL Editor)
-- =============================================================================
-- Use this to allow a user to create events (promoter) or to manage roles (admin).
-- Get user IDs from: Dashboard → Authentication → Users → copy the UUID.
--
-- RLS: only existing admins can insert into roles. So the first admin must be
-- created by running this script (e.g. with the service role / as superuser),
-- or you temporarily grant yourself admin via a migration.
-- =============================================================================

-- If scope_event_id is NOT NULL in your DB, use a global sentinel (not tied to one event):
--   '00000000-0000-0000-0000-000000000000'::uuid
-- If the column allows NULL (original MVP), you can use null instead.
-- If scope_event_id references events(id), you must use a real event id or fix the FK.

-- 1. Make yourself (or one user) an admin (run once; replace YOUR_AUTH_USER_ID)
-- insert into public.roles (user_id, role, scope_event_id)
-- values ('YOUR_AUTH_USER_ID', 'admin', '00000000-0000-0000-0000-000000000000'::uuid)
-- on conflict (user_id, role, scope_event_id) do nothing;

-- 2. Make a user a promoter (replace PROMOTER_AUTH_USER_ID)
-- insert into public.roles (user_id, role, scope_event_id)
-- values ('PROMOTER_AUTH_USER_ID', 'promoter', '00000000-0000-0000-0000-000000000000'::uuid)
-- on conflict (user_id, role, scope_event_id) do nothing;
