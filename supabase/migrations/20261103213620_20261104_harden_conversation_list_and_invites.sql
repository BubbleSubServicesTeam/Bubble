/*
# Harden conversation list lookup and lock down unused invite table access

1. Changes
- `get_user_conversations(p_user_id)` now refuses any ID other than the caller's own. Previously any signed-in user who knew another user's ID could read that user's conversation list, latest messages, and unread counts. The app already passes the signed-in user's own ID, so normal use is unaffected.
- `conversation_invites` table: removed direct table permissions from the signed-in role. The app never reads or writes this table directly; invite creation and redemption go through functions that run with owner rights, which are unaffected.

2. Security
- Function body logic is unchanged apart from the caller check at the top.
- Invite tokens remain unreadable through direct table access.

3. Notes
- Function signature and return value are unchanged.
- Re-running this migration is safe.
*/

CREATE OR REPLACE FUNCTION public.get_user_conversations(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
result json;
BEGIN
IF p_user_id IS DISTINCT FROM auth.uid() THEN
RAISE EXCEPTION 'Not authorized';
END IF;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_conversations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_conversations(uuid) TO authenticated;

REVOKE ALL ON TABLE public.conversation_invites FROM authenticated;
