
-- Grant EXECUTE on all public functions to authenticated users
GRANT EXECUTE ON FUNCTION public.create_conversation(uuid[], boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;

-- Also revoke from PUBLIC for security (only authenticated should call these)
REVOKE EXECUTE ON FUNCTION public.create_conversation(uuid[], boolean, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC;
