/*
# Fix is_conversation_member: grant EXECUTE to authenticated

## Problem
RLS policies on conversations, messages, conversation_members, etc. all call
`is_conversation_member(conv_id)`. When an `authenticated` user triggers a
query, Postgres evaluates the policy under their role. Because we previously
revoked EXECUTE from `authenticated`, the policy engine raises:
  "permission denied for function is_conversation_member"

## Fix
Grant EXECUTE back to `authenticated`. The function is still not callable
by `anon`, and the empty search_path remains in place. The security advisor
warning about "authenticated can call SECURITY DEFINER function via RPC" is
acceptable for an internal helper — the function only returns a boolean
indicating whether the current user is a member of a given conversation,
so there is no privilege-escalation risk.
*/

GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
