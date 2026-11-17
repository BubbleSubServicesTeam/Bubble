/*
# Repair device-bound message vault envelopes

1. Purpose
The original late-device repair attempted to append a key entry using the
old ephemeral public key. The corresponding private key was intentionally not
stored, so that operation could never produce a valid key. This migration adds
a narrowly scoped RPC for the sender's browser to replace a message's vault
envelope after it has locally re-encrypted the message for all current
conversation devices.

2. New Function
- `replace_message_vault(p_message_id uuid, p_vault jsonb)` replaces only the
  vault column for a message owned by the authenticated sender.

3. Security
- SECURITY DEFINER with a fixed search path.
- The caller must be the message sender and a member of the conversation.
- The function validates that the new value contains an object-shaped `eph`,
  `body`, and `keys` array before updating.
- Execute is revoked from PUBLIC and anon and granted only to authenticated.

4. Important notes
- Plaintext is never sent to this function; the browser decrypts and
  re-encrypts locally.
- The old grant function remains harmless and is not used by the repair flow.
- This migration is idempotent.
*/

CREATE OR REPLACE FUNCTION replace_message_vault(
  p_message_id uuid,
  p_vault jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_vault IS NULL
    OR jsonb_typeof(p_vault) <> 'object'
    OR jsonb_typeof(p_vault->'eph') <> 'object'
    OR jsonb_typeof(p_vault->'body') <> 'object'
    OR jsonb_typeof(p_vault->'keys') <> 'array'
  THEN
    RAISE EXCEPTION 'Invalid vault envelope';
  END IF;

  UPDATE messages m
  SET vault = p_vault
  WHERE m.id = p_message_id
    AND m.sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM conversation_members cm
      WHERE cm.conversation_id = m.conversation_id
        AND cm.user_id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION replace_message_vault(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION replace_message_vault(uuid, jsonb) TO authenticated;
