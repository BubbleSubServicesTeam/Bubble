/*
# Add "On This Day" memories function

1. New Function
- `get_on_this_day_memories(p_month, p_day)` returns up to 12 random messages sent on the given calendar day in earlier years, drawn only from conversations the caller belongs to.
- Returns message id, conversation id, sender id and name, type, text, media link, GIF link, file name, and timestamp.

2. Security
- Runs as the calling user (SECURITY INVOKER), so the existing message row rules still apply.
- Results are further limited to conversations where the caller has a membership row.
- Execute permission is revoked from PUBLIC and anon and granted only to authenticated users.

3. Notes
- Only messages from prior years are included, so the current year never appears.
- Deleted messages are excluded.
*/

CREATE OR REPLACE FUNCTION public.get_on_this_day_memories(p_month integer, p_day integer)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_name text,
  message_type text,
  content text,
  media_url text,
  gif_url text,
  file_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.id, m.conversation_id, m.sender_id, p.display_name, m.message_type,
         m.content, m.media_url, m.gif_url, m.file_name, m.created_at
  FROM messages m
  JOIN conversation_members cm
    ON cm.conversation_id = m.conversation_id AND cm.user_id = auth.uid()
  LEFT JOIN profiles p ON p.user_id = m.sender_id
  WHERE m.deleted_at IS NULL
    AND m.message_type IN ('text', 'image', 'gif', 'file', 'voicemail', 'code')
    AND EXTRACT(MONTH FROM m.created_at AT TIME ZONE 'UTC') = p_month
    AND EXTRACT(DAY FROM m.created_at AT TIME ZONE 'UTC') = p_day
    AND m.created_at < date_trunc('year', now())
  ORDER BY random()
  LIMIT 12;
$$;

REVOKE EXECUTE ON FUNCTION public.get_on_this_day_memories(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_on_this_day_memories(integer, integer) TO authenticated;
