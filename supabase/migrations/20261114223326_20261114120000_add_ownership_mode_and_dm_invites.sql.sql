/*
# Add ownership mode and invite support for 2-way chats

## What this does

1. Adds `ownership_mode` column to `conversations`:
   - `'single'` (default): only `created_by` is the owner (existing behavior)
   - `'dual'`: both the creator and the other original member are owners (for 2-way chats)
   - `'everyone'`: all members have owner-level access

2. Adds `original_member` boolean column to `conversation_members`:
   - Marks the two founding members of a 2-way chat so "dual" mode knows who the second owner is.

3. Updates `create_conversation_invite` to work on ANY conversation (not just group chats),
   so 2-way chats can also generate invite links.

4. Updates `redeem_conversation_invite` to:
   - Work on any conversation (not just groups).
   - Convert a 2-way (non-group, non-self) chat to a group chat when a third person joins.
   - Set `original_member = true` only for founding members; newcomers get `false`.

5. New function `set_conversation_ownership_mode`:
   - Lets the conversation creator change the ownership mode.
   - Only the creator can call it.

6. New function `is_conversation_owner`:
   - Returns true if the caller is an owner under the current ownership_mode.
   - Used by client code to check permissions uniformly.

## Security
- All functions are SECURITY DEFINER, search_path = public.
- All require auth.uid() non-null.
- Only the conversation creator can change ownership mode.
- Table access to conversation_invites remains fully revoked (RLS, no policies).
*/

-- 1. Add ownership_mode column
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ownership_mode text NOT NULL DEFAULT 'single'
  CHECK (ownership_mode IN ('single', 'dual', 'everyone'));

-- 2. Add original_member column to conversation_members
ALTER TABLE conversation_members
  ADD COLUMN IF NOT EXISTS original_member boolean NOT NULL DEFAULT true;

-- 3. Update create_conversation_invite to work on any conversation (not just groups)
CREATE OR REPLACE FUNCTION create_conversation_invite(p_conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text;
  v_is_self boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  -- Allow invites on any conversation the caller is a member of, except self-chat
  SELECT c.is_self_chat INTO v_is_self
  FROM conversation_members m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_uid;

  IF v_is_self IS NULL THEN
    RAISE EXCEPTION 'Only members of a conversation can create invite links' USING ERRCODE = '42501';
  END IF;

  IF v_is_self THEN
    RAISE EXCEPTION 'Cannot create invite links for saved messages' USING ERRCODE = '42501';
  END IF;

  SELECT token INTO v_token
  FROM conversation_invites
  WHERE conversation_id = p_conversation_id AND revoked_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NULL THEN
    INSERT INTO conversation_invites (conversation_id, created_by)
    VALUES (p_conversation_id, v_uid)
    RETURNING token INTO v_token;
  END IF;

  RETURN v_token;
END;
$$;

-- 4. Update redeem_conversation_invite to convert 2-way chats to groups
CREATE OR REPLACE FUNCTION redeem_conversation_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conversation_id uuid;
  v_is_group boolean;
  v_is_self boolean;
  v_member_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT i.conversation_id, c.is_group, c.is_self_chat INTO v_conversation_id, v_is_group, v_is_self
  FROM conversation_invites i
  JOIN conversations c ON c.id = i.conversation_id
  WHERE i.token = p_token
    AND i.revoked_at IS NULL;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'This invite link is invalid or has been revoked' USING ERRCODE = 'P0002';
  END IF;

  IF v_is_self THEN
    RAISE EXCEPTION 'This invite link is invalid' USING ERRCODE = 'P0002';
  END IF;

  -- Convert 2-way chat to group chat when a third person joins
  IF NOT v_is_group THEN
    SELECT count(*) INTO v_member_count
    FROM conversation_members
    WHERE conversation_id = v_conversation_id;

    IF v_member_count >= 2 THEN
      UPDATE conversations SET is_group = true WHERE id = v_conversation_id;
    END IF;
  END IF;

  -- Add the new member (idempotent), mark as non-original
  INSERT INTO conversation_members (conversation_id, user_id, original_member)
  SELECT v_conversation_id, v_uid, false
  WHERE NOT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = v_conversation_id AND user_id = v_uid
  );

  RETURN v_conversation_id;
END;
$$;

-- 5. New function to check ownership
CREATE OR REPLACE FUNCTION is_conversation_owner(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text;
  v_created_by uuid;
  v_is_member boolean;
  v_original boolean;
BEGIN
  SELECT c.ownership_mode, c.created_by INTO v_mode, v_created_by
  FROM conversations c
  WHERE c.id = p_conversation_id;

  IF v_mode IS NULL THEN RETURN false; END IF;

  -- 'single' mode: only the creator
  IF v_mode = 'single' THEN
    RETURN v_created_by = p_user_id;
  END IF;

  -- 'everyone' mode: any member is an owner
  IF v_mode = 'everyone' THEN
    SELECT true INTO v_is_member
    FROM conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
    RETURN v_is_member IS NOT NULL;
  END IF;

  -- 'dual' mode: creator + original members are owners
  IF v_mode = 'dual' THEN
    IF v_created_by = p_user_id THEN RETURN true; END IF;
    SELECT original_member INTO v_original
    FROM conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
    RETURN v_original IS NOT NULL AND v_original = true;
  END IF;

  RETURN false;
END;
$$;

-- 6. New function to set ownership mode
CREATE OR REPLACE FUNCTION set_conversation_ownership_mode(p_conversation_id uuid, p_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_created_by uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT created_by INTO v_created_by FROM conversations WHERE id = p_conversation_id;
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_created_by != v_uid THEN
    RAISE EXCEPTION 'Only the conversation creator can change ownership settings' USING ERRCODE = '42501';
  END IF;

  IF p_mode NOT IN ('single', 'dual', 'everyone') THEN
    RAISE EXCEPTION 'Invalid ownership mode' USING ERRCODE = '22023';
  END IF;

  UPDATE conversations SET ownership_mode = p_mode WHERE id = p_conversation_id;
END;
$$;

-- Re-grant for the updated functions (CREATE OR REPLACE preserves grants, but be safe)
REVOKE EXECUTE ON FUNCTION create_conversation_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_conversation_invite(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION redeem_conversation_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION redeem_conversation_invite(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION is_conversation_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_conversation_owner(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION set_conversation_ownership_mode(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_conversation_ownership_mode(uuid, text) TO authenticated;

-- Allow updating ownership_mode and is_group via the conversations table
-- (RLS already controls which rows the authenticated role can touch)
GRANT UPDATE (ownership_mode) ON conversations TO authenticated;
