-- Bulk import: resolve auth.users.id by email in one indexed query per batch.
-- Replaces unreliable GET /auth/v1/admin/users?email=... which returns an unfiltered page.

CREATE OR REPLACE FUNCTION public.admin_auth_user_ids_by_emails(_emails text[])
RETURNS TABLE (email text, user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
STABLE
AS $$
  SELECT lower(au.email::text) AS email, au.id AS user_id
  FROM auth.users AS au
  WHERE lower(au.email::text) IN (
    SELECT lower(trim(both FROM unnest(_emails)))
  );
$$;

REVOKE ALL ON FUNCTION public.admin_auth_user_ids_by_emails(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_auth_user_ids_by_emails(text[]) TO service_role;
