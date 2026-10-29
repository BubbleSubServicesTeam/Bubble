/*
# Optimize create_conversation RPC to return full conversation data

Previously the RPC only returned {id, existing}. The client then had to do
a second query to fetch the conversation row, which was slow and could fail.
This update returns the full conversation object including member profiles.
Must DROP first because we're changing the return type from json to jsonb.
*/

DROP FUNCTION IF EXISTS public.create_conversation(uuid[], boolean, text, text);

CREATE OR REPLACE FUNCTION public.create_conversation(
  p_other_user_ids uuid[],
  p_is_group boolean DEFAULT false,
  p_name text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
  v_my_id uuid;
  v_uid uuid;
  v_result jsonb;
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
      SELECT jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'is_group', c.is_group,
        'is_self_chat', c.is_self_chat,
        'avatar_url', c.avatar_url,
        'created_by', c.created_by,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'last_message', null,
        'unread_count', 0,
        'members', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', p.id, 'user_id', p.user_id, 'display_name', p.display_name,
            'first_name', p.first_name, 'last_name', p.last_name,
            'avatar_url', p.avatar_url, 'status', p.status,
            'status_message', p.status_message, 'last_seen', p.last_seen,
            'created_at', p.created_at
          ))
          FROM conversation_members cm2
          JOIN profiles p ON p.user_id = cm2.user_id
          WHERE cm2.conversation_id = c.id AND cm2.trashed_at IS NULL
        ), '[]'::jsonb),
        'existing', true
      ) INTO v_result
      FROM conversations c WHERE c.id = v_conv_id;
      
      RETURN v_result;
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

  -- Return full conversation data
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'is_group', c.is_group,
    'is_self_chat', c.is_self_chat,
    'avatar_url', c.avatar_url,
    'created_by', c.created_by,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'last_message', null,
    'unread_count', 0,
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'user_id', p.user_id, 'display_name', p.display_name,
        'first_name', p.first_name, 'last_name', p.last_name,
        'avatar_url', p.avatar_url, 'status', p.status,
        'status_message', p.status_message, 'last_seen', p.last_seen,
        'created_at', p.created_at
      ))
      FROM conversation_members cm2
      JOIN profiles p ON p.user_id = cm2.user_id
      WHERE cm2.conversation_id = c.id AND cm2.trashed_at IS NULL
    ), '[]'::jsonb),
    'existing', false
  ) INTO v_result
  FROM conversations c WHERE c.id = v_conv_id;
  
  RETURN v_result;
END;
$$;

-- Re-grant permissions
REVOKE EXECUTE ON FUNCTION public.create_conversation(uuid[], boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_conversation(uuid[], boolean, text, text) TO authenticated;
