/*
# Fix Trash: include trashed conversations in get_user_conversations

1. Why
- "Move to trash" set conversation_members.trashed_at, but get_user_conversations
  filtered those rows out (`cm.trashed_at IS NULL`), so trashed chats never
  reached the app and the Trash view was always empty.

2. Changes to get_user_conversations(p_user_id uuid)
- The main join no longer excludes the requesting user's trashed memberships.
- Each returned conversation object now includes `trashed_at` (the requesting
  member's trash timestamp) so the client can split active vs trashed chats.
- Each member object now includes that member's `trashed_at` timestamp.
- No schema, table, or policy changes. Function stays SECURITY DEFINER with
  search_path = public and the same grants as before.

3. Client impact
- The sidebar receives ALL conversations (active + trashed) and filters
  them into "chats" vs "trash" client-side, which is how the UI was designed.
*/

CREATE OR REPLACE FUNCTION public.get_user_conversations(p_user_id uuid)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object('conversations', COALESCE((
    SELECT json_agg(json_build_object(
      'id', c.id,
      'name', c.name,
      'is_group', c.is_group,
      'is_self_chat', c.is_self_chat,
      'avatar_url', c.avatar_url,
      'created_by', c.created_by,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'trashed_at', cm.trashed_at,
      'last_message', lm.msg,
      'unread_count', uc.cnt,
      'members', COALESCE((
        SELECT json_agg(json_build_object(
          'id', p.id, 'user_id', p.user_id, 'display_name', p.display_name,
          'first_name', p.first_name, 'last_name', p.last_name,
          'avatar_url', p.avatar_url, 'status', p.status,
          'status_message', p.status_message, 'last_seen', p.last_seen,
          'created_at', p.created_at, 'trashed_at', cm2.trashed_at
        ))
        FROM conversation_members cm2
        JOIN profiles p ON p.user_id = cm2.user_id
        WHERE cm2.conversation_id = c.id
      ), '[]'::json)
    ) ORDER BY c.is_self_chat DESC, c.updated_at DESC)
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = p_user_id
    LEFT JOIN LATERAL (
      SELECT to_json(row_to_json(m)) AS msg FROM (
        SELECT m.id, m.conversation_id, m.sender_id, m.message_type,
               m.content, m.gif_url, m.media_url, m.file_name, m.file_size,
               m.file_mime, m.created_at, m.deleted_at
        FROM messages m
        WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC LIMIT 1
      ) m
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt FROM messages m
      WHERE m.conversation_id = c.id
        AND m.deleted_at IS NULL
        AND m.sender_id != p_user_id
        AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamptz)
    ) uc ON true
  ), '[]'::json))
  INTO result;
  RETURN result;
END;
$$;