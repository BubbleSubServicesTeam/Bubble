/*
# Restore is_conversation_member EXECUTE for authenticated role

## Problem
The previous migration revoked EXECUTE from authenticated on is_conversation_member.
However, Postgres evaluates RLS policies under the CALLING ROLE's privileges — not
the function owner's. So when an authenticated user queries conversations/messages/etc,
Postgres tries to call is_conversation_member() as the authenticated role, which
now fails with "permission denied for function".

## Fix
Grant EXECUTE back to authenticated. The function is still not callable by anon.
The Supabase advisor warning about "authenticated can call SECURITY DEFINER function"
is acceptable here: the function ONLY returns whether the current user is a member
of a given conversation — there is no privilege escalation possible.

## Security posture after this fix
- anon: CANNOT call is_conversation_member (revoked)
- authenticated: CAN call (needed for RLS to work, only returns own membership bool)
- search_path = '' (hardened, cannot be hijacked)
- SECURITY DEFINER (bypasses RLS on conversation_members to avoid recursion)
*/

GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
