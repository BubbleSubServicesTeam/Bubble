/*
# Add delete_own_account RPC function

Allows an authenticated user to delete their own auth.users record.
Uses SECURITY DEFINER to run with elevated privileges, but validates
that the caller can only delete their own account.
*/

CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete the profile (cascade handles related data)
  DELETE FROM public.profiles WHERE user_id = auth.uid();
  -- Delete the auth user
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
