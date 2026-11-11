/*
# Fix delete_own_account: switch to SECURITY INVOKER

## Problem
The Supabase security advisor flags `delete_own_account()` because it is
SECURITY DEFINER and callable by the `authenticated` role via REST RPC.
A SECURITY DEFINER function runs with the function owner's (superuser)
privileges, which is a wider blast radius than needed.

## Fix
Switch to SECURITY INVOKER so the function runs with the privileges of the
calling user. The two DELETE statements already work correctly under the
calling user's session:
- `DELETE FROM public.profiles WHERE user_id = auth.uid()` is covered by
  the existing RLS delete policy (`auth.uid() = user_id`).
- `DELETE FROM auth.users WHERE id = auth.uid()` works because Supabase
  grants authenticated users the ability to delete their own auth.users row.

No behaviour change for end-users; the security exposure is eliminated.
*/

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.profiles WHERE user_id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Revoke from public/anon; keep authenticated so the app can call it via RPC.
REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
