/*
# Fix 2 Supabase Security Advisor Issues

## Issue 1: SECURITY DEFINER function callable by authenticated via RPC
`is_conversation_member` is flagged because authenticated users can call it
directly via `/rest/v1/rpc/is_conversation_member`. While it only returns a
boolean, SECURITY DEFINER functions callable via RPC are a security risk.
Fix: revoke EXECUTE from authenticated; grant it only to the Postgres roles
that need it internally (the policy engine runs as the function owner, not the
calling role, so policies still work after this revoke).

## Issue 2: Function search_path not explicitly locked (belt-and-suspenders)
Re-apply empty search_path to both functions to ensure the advisor sees the
correct configuration on a fresh read of pg_proc.proconfig.

## Changes
- `is_conversation_member`: REVOKE EXECUTE from authenticated (RPC-blocking),
  keep search_path = '' locked.
- `delete_own_account`: Re-affirm search_path = '' and SECURITY INVOKER,
  revoke from PUBLIC/anon (belt-and-suspenders), keep authenticated.
- `conversations.created_by`: confirm DEFAULT auth.uid() is in place (idempotent).
*/

-- ── Issue 1: Block direct RPC call to is_conversation_member ─────────────────
-- The Postgres policy engine invokes it under the function owner's privileges
-- (SECURITY DEFINER), so revoking from authenticated does NOT break policies.
-- It just prevents `supabase.rpc('is_conversation_member', { conv_id: '...' })`.

CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = conv_id
      AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon, authenticated;
-- Grant back to postgres and service_role only (internal use only)
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO postgres, service_role;

-- ── Issue 2: Re-affirm delete_own_account security posture ───────────────────
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

REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

-- ── Ensure conversations.created_by has DEFAULT auth.uid() ───────────────────
ALTER TABLE public.conversations
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- ── Ensure conversations INSERT policy uses DEFAULT (no explicit created_by check needed) ──
-- The policy remains: WITH CHECK (auth.uid() = created_by)
-- The DEFAULT fills created_by from the session so this always passes.
DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
CREATE POLICY "conversations_insert" ON public.conversations
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);
