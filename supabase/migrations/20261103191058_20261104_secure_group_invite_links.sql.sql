/*
# Secure group invite links

1. New Tables
- `conversation_invites`: one active invite token per group chat. Tokens are long random strings. Revoked invites are kept with a `revoked_at` timestamp.

2. New Functions
- `create_conversation_invite(conversation_id)`: any member of a group chat gets its active invite token, creating one if none exists yet.
- `redeem_conversation_invite(token)`: a signed-in user who opens a valid invite link is added to that group chat. Redeeming is idempotent, so opening the link twice does not duplicate membership.

3. Security
- Row level security is enabled on `conversation_invites` with no policies, so no client can read, insert, or change invites directly.
- Both functions run with elevated rights but check the caller's identity themselves. Anonymous callers cannot execute them.
- Invite tokens are only issued for group chats.
*/

CREATE TABLE IF NOT EXISTS conversation_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS conversation_invites_conversation_idx ON conversation_invites (conversation_id) WHERE revoked_at IS NULL;

ALTER TABLE conversation_invites ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION create_conversation_invite(p_conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM conversation_members m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_uid
      AND c.is_group
  ) THEN
    RAISE EXCEPTION 'Only members of a group chat can create invite links' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION redeem_conversation_invite(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conversation_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT i.conversation_id INTO v_conversation_id
  FROM conversation_invites i
  JOIN conversations c ON c.id = i.conversation_id
  WHERE i.token = p_token
    AND i.revoked_at IS NULL
    AND c.is_group;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'This invite link is invalid or has been revoked' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO conversation_members (conversation_id, user_id)
  SELECT v_conversation_id, v_uid
  WHERE NOT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = v_conversation_id AND user_id = v_uid
  );

  RETURN v_conversation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_conversation_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_conversation_invite(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION redeem_conversation_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION redeem_conversation_invite(text) TO authenticated;
