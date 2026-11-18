/*
# Add delete_conversation function (real chat deletion)

1. New Function
- `delete_conversation(p_conversation_id uuid)` deletes the conversation row itself.
- All related data is removed automatically by existing cascade foreign keys:
  messages, conversation_members, chat_wallpapers, polls, forms, saved messages,
  invites, notifications, typing indicators, call invites, WhatsApp imports, and more.

2. Security
- SECURITY DEFINER with a fixed search_path, so the delete can cascade across
  tables whose policies would otherwise block a member.
- Only a current member of the conversation may delete it; everyone else gets nothing.
- Execute revoked from PUBLIC and anon, granted to authenticated only.
*/

CREATE OR REPLACE FUNCTION public.delete_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_member boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  ) INTO is_member;
  IF NOT is_member THEN
    RETURN false;
  END IF;

  DELETE FROM conversations WHERE id = p_conversation_id;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_conversation(uuid) TO authenticated;
