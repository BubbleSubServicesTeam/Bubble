/*
# Group Member Management

## Purpose
Add RPC functions to let any group member add people to a group chat,
and let only the group owner (created_by) remove members from a group chat.

## Changes

### New Functions
1. `add_conversation_member(p_conv_id uuid, p_user_id uuid)`
   - Any existing member of the conversation can add a new member.
   - SECURITY DEFINER so it can insert into conversation_members bypassing RLS recursion.
   - Returns void.

2. `remove_conversation_member(p_conv_id uuid, p_user_id uuid)`
   - Only the conversation owner (conversations.created_by = auth.uid()) can remove a member.
   - SECURITY DEFINER so it can delete from conversation_members bypassing RLS recursion.
   - Prevents the owner from removing themselves (use leave chat instead).
   - Returns void.

### Security
- Both functions check authentication via auth.uid().
- `add_conversation_member` verifies the caller is already a member.
- `remove_conversation_member` verifies the caller is the conversation owner.
- EXECUTE is granted to `authenticated` only (not anon, not public).

### Important Notes
1. These functions are SECURITY DEFINER with search_path = public to avoid RLS recursion on conversation_members.
2. The owner is determined by conversations.created_by, which is set at creation time and cannot be changed by non-owners.
*/

-- Add member: any existing member can add
CREATE OR REPLACE FUNCTION public.add_conversation_member(p_conv_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_my_id uuid;
  v_is_member boolean;
BEGIN
  v_my_id := auth.uid();
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check that the caller is a member of this conversation
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = p_conv_id
    AND user_id = v_my_id
    AND trashed_at IS NULL
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'You are not a member of this conversation';
  END IF;

  -- Insert the new member (idempotent)
  INSERT INTO conversation_members (conversation_id, user_id)
  VALUES (p_conv_id, p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Remove member: only the conversation owner can remove
CREATE OR REPLACE FUNCTION public.remove_conversation_member(p_conv_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_my_id uuid;
  v_owner uuid;
BEGIN
  v_my_id := auth.uid();
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the conversation owner
  SELECT created_by INTO v_owner FROM conversations WHERE id = p_conv_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_my_id != v_owner THEN
    RAISE EXCEPTION 'Only the group owner can remove members';
  END IF;

  IF v_my_id = p_user_id THEN
    RAISE EXCEPTION 'Cannot remove yourself. Use leave chat instead.';
  END IF;

  DELETE FROM conversation_members
  WHERE conversation_id = p_conv_id
  AND user_id = p_user_id;
END;
$$;

-- Grant execute to authenticated only
REVOKE ALL ON FUNCTION public.add_conversation_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_conversation_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_conversation_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_conversation_member(uuid, uuid) TO authenticated;
