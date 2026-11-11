/*
# Suspended accounts lose admin power and cannot start new chats

1. Changed Functions
- `is_admin_user()` now returns false when the signed-in account is suspended. Every admin action (list users, suspend, delete user, maintenance) checks this function, so a suspended admin is locked out of all of them.

2. Changed Triggers
- `conversations`: a new BEFORE INSERT check rejects creating a conversation when the creator is suspended.

3. Security
- Enforced in the database, so the app cannot bypass it.
- No table grants or policies change.

Important notes:
1. Existing conversations and messages are not modified.
2. Suspended users can still read their chats, as before.
*/

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_admin AND NOT p.is_suspended FROM public.profiles p WHERE p.user_id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.block_suspended_conversation_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = NEW.created_by AND p.is_suspended) THEN
    RAISE EXCEPTION 'Suspended accounts cannot start new chats';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.block_suspended_conversation_creation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS block_suspended_conversation_creation ON public.conversations;
CREATE TRIGGER block_suspended_conversation_creation
BEFORE INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.block_suspended_conversation_creation();
