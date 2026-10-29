-- Fix: grant EXECUTE on is_conversation_member to authenticated and anon
-- Without this, RLS policies that call is_conversation_member fail silently,
-- causing all conversation_members SELECTs to return zero rows (chats disappear).

GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO anon;
