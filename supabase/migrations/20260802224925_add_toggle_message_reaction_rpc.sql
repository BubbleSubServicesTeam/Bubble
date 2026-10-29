/*
# Add toggle_message_reaction RPC

1. New Functions
- `toggle_message_reaction(p_message_id uuid, p_emoji text)` — SECURITY DEFINER function
  that adds or removes the calling user's reaction emoji on a message. This allows ANY
  conversation member to react to ANY message (not just the sender), which the current
  UPDATE RLS policy blocks because it checks `auth.uid() = sender_id`.

2. Security
- SECURITY DEFINER so it runs with elevated privileges, bypassing the messages UPDATE RLS.
- Verifies the caller is a member of the message's conversation via is_conversation_member().
- Only modifies the `reactions` JSON column — never touches content, sender_id, etc.
- SEARCH_PATH locked to 'public' for security.
*/

CREATE OR REPLACE FUNCTION public.toggle_message_reaction(p_message_id uuid, p_emoji text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
  v_current jsonb;
  v_users text[];
  v_updated jsonb;
BEGIN
  -- Get the conversation_id for this message
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  IF v_conv_id IS NULL THEN
    RETURN;
  END IF;

  -- Verify caller is a member of the conversation
  IF NOT is_conversation_member(v_conv_id) THEN
    RETURN;
  END IF;

  -- Get current reactions
  SELECT reactions INTO v_current FROM messages WHERE id = p_message_id;
  IF v_current IS NULL THEN
    v_current := '{}'::jsonb;
  END IF;

  v_users := ARRAY(SELECT jsonb_array_elements_text(v_current -> p_emoji));

  IF array_position(v_users, auth.uid()::text) IS NOT NULL THEN
    -- Remove user's reaction
    v_users := array_remove(v_users, auth.uid()::text);
    IF array_length(v_users, 1) IS NULL THEN
      v_updated := v_current - p_emoji;
    ELSE
      v_updated := jsonb_set(v_current, ARRAY[p_emoji], to_jsonb(v_users));
    END IF;
  ELSE
    -- Add user's reaction
    v_users := array_append(v_users, auth.uid()::text);
    v_updated := jsonb_set(v_current, ARRAY[p_emoji], to_jsonb(v_users));
  END IF;

  UPDATE messages SET reactions = v_updated WHERE id = p_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_message_reaction TO authenticated;
