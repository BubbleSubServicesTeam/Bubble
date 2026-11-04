/*
# Fix message visibility when conversation is trashed

## Problem
The `is_conversation_member()` function checked `trashed_at IS NULL`, which
meant that if a user trashed a conversation, they could no longer SELECT
messages in it. This meant two people in a conversation where one trashed
it couldn't see each other's messages — the trashed user was completely
locked out of message access even if the other person kept sending messages.

## Fix
Remove the `trashed_at IS NULL` check from `is_conversation_member()`.
Trash status should only affect whether a conversation appears in the
user's conversation list (handled in `get_user_conversations`), not
whether they can access messages once they open the conversation.

## Security
No security changes — RLS policies still check membership via this function.
The function still verifies the user is a member of the conversation.
*/

CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1 FROM public.conversation_members
  WHERE conversation_id = conv_id
  AND user_id = auth.uid()
);
$function$;
