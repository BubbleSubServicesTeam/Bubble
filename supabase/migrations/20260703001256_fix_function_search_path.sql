
-- Fix is_conversation_member: set proper search_path for SECURITY DEFINER
-- Empty search_path can cause function to fail when called from RLS
ALTER FUNCTION public.is_conversation_member(uuid) SET search_path = public;

-- Also fix create_conversation search_path
ALTER FUNCTION public.create_conversation(uuid[], boolean, text, text) SET search_path = public;
