/*
# Fix get_user_conversations return type to jsonb

## Purpose
The json return type may be received as a string by supabase-js. Switching to jsonb
ensures the client receives a properly parsed object.

## Changes
- Change return type from json to jsonb
*/

DROP FUNCTION IF EXISTS public.get_user_conversations(uuid);

CREATE OR REPLACE FUNCTION public.get_user_conversations(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object('conversations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'is_group', c.is_group,
      'is_self_chat', c.is_self_chat,
      'avatar_url', c.avatar_url,
      'created_by', c.created_by,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'last_message', (
        SELECT to_jsonb(m) FROM (
          SELECT m.id, m.conversation_id, m.sender_id, m.message_type,
                 m.content, m.gif_url, m.media_url, m.file_name, m.file_size,
                 m.file_mime, m.created_at, m.deleted_at
          FROM messages m
          WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
          ORDER BY m.created_at DESC LIMIT 1
        ) m
      ),
      'unread_count', (
        SELECT count(*)::int FROM messages m
        WHERE m.conversation_id = c.id
          AND m.deleted_at IS NULL
          AND m.sender_id != p_user_id
          AND m.created_at > COALESCE(
            (SELECT cm.last_read_at FROM conversation_members cm
             WHERE cm.conversation_id = c.id AND cm.user_id = p_user_id),
            '1970-01-01'::timestamptz
          )
      ),
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
      ), '[]'::jsonb)
    ) ORDER BY c.is_self_chat DESC, c.updated_at DESC)
    FROM conversations c
    WHERE c.id IN (
      SELECT conversation_id FROM conversation_members
      WHERE user_id = p_user_id AND trashed_at IS NULL
    )
  ), '[]'::jsonb))
  INTO result;
  RETURN result;
END;
$$;
