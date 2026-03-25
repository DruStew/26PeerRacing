-- Allow authenticated users to insert their own profile row (first-time profile completion).
-- Without this, upsert fails with RLS when the user has no profile row yet.

create policy profiles_insert_own
  on profiles for insert
  to authenticated
  with check (id = auth.uid());
