/*
# Fix delete_own_account: lock search_path + revoke anon execute

1. Recreate `delete_own_account` with `SET search_path = ''` (empty/immutable)
   so all table references are fully-qualified, eliminating the mutable
   search_path security warning.
2. Re-grant EXECUTE to `authenticated` only (anon and public stay revoked).
*/

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.profiles WHERE user_id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Revoke from everyone, then grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
