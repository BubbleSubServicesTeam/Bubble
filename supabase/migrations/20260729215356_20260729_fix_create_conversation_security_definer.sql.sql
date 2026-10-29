-- Fix: create_conversation MUST be SECURITY DEFINER
-- 
-- Root cause: A previous migration switched this function to SECURITY INVOKER.
-- With INVOKER mode, RLS policies block the function from inserting OTHER users
-- into conversation_members (the RLS policy requires user_id = auth.uid() OR
-- is_conversation_member()). This made it impossible to create new conversations.
--
-- SECURITY DEFINER allows the function to bypass RLS and insert all members.
-- The function already has SET search_path = public to prevent search_path injection.

CREATE OR REPLACE FUNCTION public.create_conversation(
  p_other_user_ids uuid[],
  p_is_group boolean DEFAULT false,
  p_name text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    FROM conversations c
    WHERE c.is_group = false
      AND c.is_self_chat IS NOT TRUE
      AND EXISTS (
        SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = v_my_id
      )
      AND EXISTS (
        SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = p_other_user_ids[1]
      )
      AND (
        SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id
      ) = 2;
    
    IF v_conv_id IS NOT NULL THEN
      RETURN json_build_object('id', v_conv_id, 'existing', true);
    END IF;
  END IF;

  -- Create the conversation
  INSERT INTO conversations (created_by, is_group, name, avatar_url)
  VALUES (v_my_id, p_is_group, p_name, p_avatar_url)
  RETURNING id INTO v_conv_id;

  -- Add caller as member
  INSERT INTO conversation_members (conversation_id, user_id)
  VALUES (v_conv_id, v_my_id)
  ON CONFLICT DO NOTHING;

  -- Add other users
  IF p_other_user_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY p_other_user_ids LOOP
      INSERT INTO conversation_members (conversation_id, user_id)
      VALUES (v_conv_id, v_uid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN json_build_object('id', v_conv_id, 'existing', false);
END;
$$;

-- Re-grant permissions
REVOKE EXECUTE ON FUNCTION public.create_conversation(uuid[], boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_conversation(uuid[], boolean, text, text) TO authenticated;
