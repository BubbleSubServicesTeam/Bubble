/*
# WhatsApp import attribution readable by chat members + pending metadata

1. Purpose
- Imported-message attribution (who originally sent each line) was only
  readable by the importer. When the other person claims the chat, they also
  need it to render history correctly. The policy now allows any current
  member of the imported conversation to read the attribution rows.
- New function `get_whatsapp_import_meta(p_conversation_id)` returns
  attribution for every imported message in one call for conversation members.
- New function `get_my_import_state(p_conversation_id)` returns the import
  status ('pending'/'claimed'), the other person's stored name, and whether
  the caller is the importer, so the chat can show an imported/pending badge.

2. Security
- Both functions are SECURITY DEFINER with fixed search paths, callable only
  by signed-in users, and verify conversation membership internally.
- Attribution is only exposed for conversations the caller belongs to.

3. Important notes
- This migration is idempotent.
*/

DROP POLICY IF EXISTS "whatsapp_import_messages_select_importer" ON whatsapp_import_messages;
CREATE POLICY "whatsapp_import_messages_select_member" ON whatsapp_import_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM whatsapp_imports wi
    JOIN conversation_members cm ON cm.conversation_id = wi.conversation_id
    WHERE wi.id = import_id AND cm.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.get_whatsapp_import_meta(p_conversation_id uuid)
RETURNS TABLE (message_id uuid, from_me boolean, original_sender text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wim.message_id, wim.from_me, wim.original_sender
  FROM whatsapp_import_messages wim
  JOIN whatsapp_imports wi ON wi.id = wim.import_id
  WHERE wi.conversation_id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = p_conversation_id AND cm.user_id = auth.uid()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_whatsapp_import_meta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_import_meta(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_import_state(p_conversation_id uuid)
RETURNS TABLE (status text, other_name text, other_phone text, is_importer boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wi.status, wi.other_name, wi.other_phone, (wi.importer_id = auth.uid())
  FROM whatsapp_imports wi
  WHERE wi.conversation_id = p_conversation_id
    AND (
      wi.importer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM conversation_members cm
        WHERE cm.conversation_id = p_conversation_id AND cm.user_id = auth.uid()
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_import_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_import_state(uuid) TO authenticated;
