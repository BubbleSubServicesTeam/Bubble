-- Revoke EXECUTE from public and anon, grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
