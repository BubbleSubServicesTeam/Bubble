/*
# Split Bubble PIN and password lockouts

## Purpose
PIN and password unlocks are separate authentication methods. A PIN lock must not consume
or block the password's five attempts, and a password lock must not consume the PIN's attempts.

## Modified table
- `profiles`
- Adds independent PIN failed-attempt and lock-expiration columns.
- Adds independent password failed-attempt and lock-expiration columns.
- Existing shared lock columns remain for compatibility and are no longer used by the client.

## Security
- Adds server-side SECURITY DEFINER functions for each method.
- Functions derive the account from `auth.uid()` and use row locks for atomic counters.
- Only authenticated users can call them.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pin_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS password_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS password_locked_until timestamptz;

CREATE OR REPLACE FUNCTION public.get_unlock_lock_status()
RETURNS TABLE (pin_locked_until timestamptz, password_locked_until timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.pin_locked_until, p.password_locked_until
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.record_pin_failure()
RETURNS TABLE (failed_attempts integer, locked_until timestamptz, is_locked boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  attempts integer;
  locked timestamptz;
BEGIN
  SELECT COALESCE(pin_failed_attempts, 0), pin_locked_until INTO attempts, locked
  FROM public.profiles WHERE user_id = auth.uid() FOR UPDATE;
  IF locked IS NOT NULL AND locked > now() THEN
    RETURN QUERY SELECT attempts, locked, true; RETURN;
  END IF;
  attempts := attempts + 1;
  locked := CASE WHEN attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END;
  UPDATE public.profiles SET pin_failed_attempts = attempts, pin_locked_until = locked WHERE user_id = auth.uid();
  RETURN QUERY SELECT attempts, locked, locked IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_password_failure()
RETURNS TABLE (failed_attempts integer, locked_until timestamptz, is_locked boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  attempts integer;
  locked timestamptz;
BEGIN
  SELECT COALESCE(password_failed_attempts, 0), password_locked_until INTO attempts, locked
  FROM public.profiles WHERE user_id = auth.uid() FOR UPDATE;
  IF locked IS NOT NULL AND locked > now() THEN
    RETURN QUERY SELECT attempts, locked, true; RETURN;
  END IF;
  attempts := attempts + 1;
  locked := CASE WHEN attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END;
  UPDATE public.profiles SET password_failed_attempts = attempts, password_locked_until = locked WHERE user_id = auth.uid();
  RETURN QUERY SELECT attempts, locked, locked IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_pin_failures()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ UPDATE public.profiles SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE user_id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.clear_password_failures()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ UPDATE public.profiles SET password_failed_attempts = 0, password_locked_until = NULL WHERE user_id = auth.uid(); $$;

REVOKE EXECUTE ON FUNCTION public.get_unlock_lock_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_pin_failure() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_password_failure() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clear_pin_failures() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clear_password_failures() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unlock_lock_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_pin_failure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_password_failure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_pin_failures() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_password_failures() TO authenticated;
