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

-- 1. Make yourself (or one user) an admin (run once; replace the UUID)
-- insert into public.roles (user_id, role, scope_event_id)
-- values ('YOUR_AUTH_USER_ID', 'admin', null)
-- on conflict (user_id, role, scope_event_id) do nothing;

-- 2. Make a user a promoter (run as an admin, or paste in SQL Editor; replace UUID)
-- insert into public.roles (user_id, role, scope_event_id)
-- values ('PROMOTER_AUTH_USER_ID', 'promoter', null)
-- on conflict (user_id, role, scope_event_id) do nothing;

-- Example (uncomment and replace with real UUIDs):
-- insert into public.roles (user_id, role, scope_event_id)
-- values ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'admin', null)
-- on conflict (user_id, role, scope_event_id) do nothing;
