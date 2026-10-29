/*
# Fix security issues on SECURITY DEFINER functions

## Problems
1. `is_conversation_member` has a mutable search_path — attacker could hijack
   schema resolution by setting search_path before calling the function.
2. Both `is_conversation_member` variants and `delete_own_account` are executable
   by `anon` and `authenticated` roles via the REST API, which is unintentional.

## Fixes
1. Add `SET search_path = ''` (empty, immutable) to `is_conversation_member` so
   all object references are fully-qualified and the path cannot be manipulated.
2. Revoke EXECUTE on both functions from `anon`, `authenticated`, and `public`
   so they cannot be called directly via `/rest/v1/rpc/`. They remain callable
   internally (by the Postgres policy engine / planner) under the function
   owner's privileges, which is all they need.
*/

-- 1. Recreate is_conversation_member with a locked-down search_path
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

-- 2. Revoke public/anon/authenticated EXECUTE on is_conversation_member (both signatures)
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon, authenticated;

-- Handle the two-argument variant if it exists (drop it — it is unused)
DROP FUNCTION IF EXISTS public.is_conversation_member(uuid, uuid);

-- 3. Revoke public/anon EXECUTE on delete_own_account
--    Authenticated users still need to call it via RPC, so we only revoke anon + public.
REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
