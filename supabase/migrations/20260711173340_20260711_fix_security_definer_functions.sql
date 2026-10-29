-- ============================================================
-- Fix security issues:
-- 1. is_conversation_member: SECURITY DEFINER exposed via REST
-- 2. create_conversation: SECURITY DEFINER exposed via REST
-- Strategy: inline membership checks in RLS policies, drop the
-- function, and switch create_conversation to SECURITY INVOKER.
-- ============================================================

-- 1. Drop ALL policies that reference is_conversation_member
DROP POLICY IF EXISTS "conv_members_select" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_insert" ON conversation_members;
DROP POLICY IF EXISTS "conversations_select" ON conversations;
DROP POLICY IF EXISTS "conversations_update" ON conversations;
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "typing_select" ON typing_indicators;

-- 2. Recreate conversation_members SELECT (simple ownership)
CREATE POLICY "conv_members_select_own" ON conversation_members FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- 3. Recreate conversation_members INSERT (inline check)
CREATE POLICY "conv_members_insert_own" ON conversation_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
      AND cm.user_id = auth.uid()
    )
  );

-- 4. Recreate conversations SELECT (inline subquery)
CREATE POLICY "conversations_select_member" ON conversations FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = conversations.id
      AND cm.user_id = auth.uid()
      AND cm.trashed_at IS NULL
    )
  );

-- 5. Recreate conversations UPDATE (inline subquery)
CREATE POLICY "conversations_update_member" ON conversations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = conversations.id
      AND cm.user_id = auth.uid()
      AND cm.trashed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = conversations.id
      AND cm.user_id = auth.uid()
      AND cm.trashed_at IS NULL
    )
  );

-- 6. Recreate messages SELECT (inline subquery)
CREATE POLICY "messages_select_member" ON messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
      AND cm.user_id = auth.uid()
      AND cm.trashed_at IS NULL
    )
  );

-- 7. Recreate messages INSERT (inline subquery)
CREATE POLICY "messages_insert_own" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
      AND cm.user_id = auth.uid()
      AND cm.trashed_at IS NULL
    )
  );

-- 8. Recreate typing_indicators SELECT (inline subquery)
CREATE POLICY "typing_select_member" ON typing_indicators FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = typing_indicators.conversation_id
      AND cm.user_id = auth.uid()
      AND cm.trashed_at IS NULL
    )
  );

-- 9. Now drop is_conversation_member (all dependents removed)
DROP FUNCTION IF EXISTS public.is_conversation_member(uuid);

-- 10. Recreate create_conversation as SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.create_conversation(
  p_other_user_ids uuid[],
  p_is_group boolean DEFAULT false,
  p_name text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conv_id uuid;
  v_my_id uuid;
  v_uid uuid;
BEGIN
  v_my_id := auth.uid();
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- For DMs (not groups, single other user), check if conversation already exists
  IF NOT p_is_group AND p_other_user_ids IS NOT NULL AND array_length(p_other_user_ids, 1) = 1 THEN
    SELECT c.id INTO v_conv_id
    FROM public.conversations c
    WHERE c.is_group = false
    AND c.is_self_chat IS NOT TRUE
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = v_my_id
    )
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = p_other_user_ids[1]
    )
    AND (
      SELECT COUNT(*) FROM public.conversation_members cm WHERE cm.conversation_id = c.id
    ) = 2;

    IF v_conv_id IS NOT NULL THEN
      RETURN json_build_object('id', v_conv_id, 'existing', true);
    END IF;
  END IF;

  -- Create the conversation
  INSERT INTO public.conversations (created_by, is_group, name, avatar_url)
  VALUES (v_my_id, p_is_group, p_name, p_avatar_url)
  RETURNING id INTO v_conv_id;

  -- Add caller as member
  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, v_my_id)
  ON CONFLICT DO NOTHING;

  -- Add other users
  IF p_other_user_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY p_other_user_ids LOOP
      INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES (v_conv_id, v_uid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN json_build_object('id', v_conv_id, 'existing', false);
END;
$function$;

-- Revoke EXECUTE from anon (only authenticated should call it)
REVOKE EXECUTE ON FUNCTION public.create_conversation(uuid[], boolean, text, text) FROM anon;
