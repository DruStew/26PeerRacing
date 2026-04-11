-- PostgREST often fails to expose RPCs whose arg name starts with "_". Recreate with `emails`.

DROP FUNCTION IF EXISTS public.admin_auth_user_ids_by_emails(text[]);

CREATE OR REPLACE FUNCTION public.admin_auth_user_ids_by_emails(emails text[])
RETURNS TABLE (email text, user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
STABLE
AS $$
  SELECT lower(au.email::text) AS email, au.id AS user_id
  FROM auth.users AS au
  WHERE lower(au.email::text) IN (
    SELECT lower(trim(both FROM unnest(emails)))
  );
$$;

REVOKE ALL ON FUNCTION public.admin_auth_user_ids_by_emails(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_auth_user_ids_by_emails(text[]) TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
