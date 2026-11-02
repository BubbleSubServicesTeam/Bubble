/*
# Add Bubble authentication attempt lockout

## Purpose
Prevent repeated wrong Bubble PIN or password attempts from continuing indefinitely.
After five failed unlock attempts, the Bubble account is locked for 15 minutes.
The lock is stored server-side so refreshing the page cannot reset it.

## Modified table
- `profiles`
- Adds `auth_failed_attempts` to count consecutive failed Bubble unlock attempts.
- Adds `auth_locked_until` to store the lock expiration time.

## Security
- Adds SECURITY DEFINER RPCs with a fixed `search_path`.
- RPCs use `auth.uid()` and can only modify or read the current signed-in user's lock state.
- Direct function execution is revoked from PUBLIC and anon and granted only to authenticated.
- No user data is deleted.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auth_locked_until timestamptz;

CREATE OR REPLACE FUNCTION public.get_auth_lock_status()
RETURNS TABLE (failed_attempts integer, locked_until timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.auth_failed_attempts, 0), p.auth_locked_until
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.record_auth_failure()
RETURNS TABLE (failed_attempts integer, locked_until timestamptz, is_locked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_attempts integer;
  next_locked_until timestamptz;
BEGIN
  SELECT COALESCE(p.auth_failed_attempts, 0), p.auth_locked_until
    INTO next_attempts, next_locked_until
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  FOR UPDATE;

  IF next_locked_until IS NOT NULL AND next_locked_until > now() THEN
    RETURN QUERY SELECT next_attempts, next_locked_until, true;
    RETURN;
  END IF;

  next_attempts := next_attempts + 1;
  IF next_attempts >= 5 THEN
    next_locked_until := now() + interval '15 minutes';
  ELSE
    next_locked_until := NULL;
  END IF;

  UPDATE public.profiles
  SET auth_failed_attempts = next_attempts,
      auth_locked_until = next_locked_until
  WHERE user_id = auth.uid();

  RETURN QUERY SELECT next_attempts, next_locked_until, next_locked_until IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_auth_failures()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET auth_failed_attempts = 0, auth_locked_until = NULL
  WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_auth_lock_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_auth_failure() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clear_auth_failures() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_lock_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_auth_failure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_auth_failures() TO authenticated;
