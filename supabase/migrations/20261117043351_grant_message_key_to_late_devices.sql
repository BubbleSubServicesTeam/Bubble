/*
# Share vault message keys with devices that registered late

1. Purpose
Messages sealed with the device-bound vault are wrapped only for the devices
registered at send time. A recipient whose device registered afterwards sees
"Locked on this device" forever, because only the sender's device holds the
message key material needed to wrap it for the new device.

2. New Function
- `grant_message_key_to_device(p_message_id uuid, p_device_id text, p_iv text, p_key text)`
  Appends one wrapped key entry (`d`, `iv`, `k`) to the message's `vault.keys`
  array. The call is idempotent: if the device already has a key entry, nothing
  changes.

3. Security
- SECURITY DEFINER with a fixed `search_path`, callable only by `authenticated`.
- The caller must be the original sender of the message (`sender_id = auth.uid()`
  is derived from the session, never from a parameter).
- The target device must belong to a current member of the message's
  conversation, so keys can only be granted to legitimate participants.
- No other columns or tables are writable through this function.

4. Important notes
- Existing vault envelopes keep working unchanged.
- Granting a key emits a message UPDATE through realtime, so a waiting
  recipient unlocks the message without reloading.
*/

CREATE OR REPLACE FUNCTION grant_message_key_to_device(
  p_message_id uuid,
  p_device_id text,
  p_iv text,
  p_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
  v_vault jsonb;
  v_keys jsonb;
BEGIN
  IF p_device_id IS NULL OR p_iv IS NULL OR p_key IS NULL THEN
    RAISE EXCEPTION 'Missing key material';
  END IF;

  SELECT conversation_id, vault INTO v_conversation_id, v_vault
  FROM messages
  WHERE id = p_message_id AND sender_id = auth.uid();

  IF v_conversation_id IS NULL OR v_vault IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM vault_devices vd
    JOIN conversation_members cm ON cm.user_id = vd.user_id
    WHERE vd.device_id = p_device_id
      AND cm.conversation_id = v_conversation_id
  ) THEN
    RAISE EXCEPTION 'Device is not a conversation member device';
  END IF;

  v_keys := COALESCE(v_vault->'keys', '[]'::jsonb);

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_keys) AS k WHERE k->>'d' = p_device_id
  ) THEN
    v_keys := v_keys || jsonb_build_object('d', p_device_id, 'iv', p_iv, 'k', p_key);
    UPDATE messages
    SET vault = jsonb_set(v_vault, '{keys}', v_keys)
    WHERE id = p_message_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION grant_message_key_to_device(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION grant_message_key_to_device(uuid, text, text, text) TO authenticated;
