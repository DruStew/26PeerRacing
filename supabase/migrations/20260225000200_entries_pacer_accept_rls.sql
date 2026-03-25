-- Pacer flow: allow authenticated users to see open pacer requests and accept (set pacer_user_id).
-- Membership gate is enforced in app (API + page); RLS only controls who can read/update which entries.

-- Select: own entries (existing) OR open pacer requests OR entries where I am the pacer
drop policy if exists entries_select_pacer on entries;
create policy entries_select_pacer on entries for select to authenticated
  using (
    user_id = auth.uid()
    or (pacer_status = 'requested' and pacer_user_id is null)
    or pacer_user_id = auth.uid()
  );

-- Update: only allow setting self as pacer when entry is in requested state with no pacer
drop policy if exists entries_update_pacer_accept on entries;
create policy entries_update_pacer_accept on entries for update to authenticated
  using (pacer_status = 'requested' and pacer_user_id is null)
  with check (pacer_user_id = auth.uid() and pacer_status = 'accepted');
