/*
# Device-bound message vault

1. New Tables
- `vault_devices`: one row per browser/device that has a vault key. Stores only the device's PUBLIC key (never the private key, which stays in that browser).
  Columns: id, user_id, device_id, public_key (jwk), created_at, last_seen_at.
2. Modified Tables
- `messages`: new nullable column `vault` (jsonb). Holds the encrypted text envelope for text messages sent through the vault.
3. Functions
- `get_conversation_vault_devices(conversation)`: returns the public device keys of the conversation's members. Only callable by a member of that conversation.
4. Security
- RLS enabled on `vault_devices`. Users can only insert/update/delete their own device rows; any signed-in user can read device rows (public keys are not secret).
- The lookup function checks membership before returning anything and is restricted to signed-in users.

Important notes
- Existing messages are not changed. Only text messages sent after this migration use the vault.
*/

CREATE TABLE IF NOT EXISTS vault_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  public_key jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

ALTER TABLE vault_devices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON vault_devices TO authenticated;

DROP POLICY IF EXISTS "vault_devices_select" ON vault_devices;
CREATE POLICY "vault_devices_select" ON vault_devices FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "vault_devices_insert_own" ON vault_devices;
CREATE POLICY "vault_devices_insert_own" ON vault_devices FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vault_devices_update_own" ON vault_devices;
CREATE POLICY "vault_devices_update_own" ON vault_devices FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vault_devices_delete_own" ON vault_devices;
CREATE POLICY "vault_devices_delete_own" ON vault_devices FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS vault jsonb;

CREATE OR REPLACE FUNCTION get_conversation_vault_devices(p_conversation_id uuid)
RETURNS TABLE (user_id uuid, device_id text, public_key jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vd.user_id, vd.device_id, vd.public_key
  FROM vault_devices vd
  JOIN conversation_members cm ON cm.user_id = vd.user_id
  WHERE cm.conversation_id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM conversation_members me
      WHERE me.conversation_id = p_conversation_id AND me.user_id = auth.uid()
    );
$$;

REVOKE EXECUTE ON FUNCTION get_conversation_vault_devices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_conversation_vault_devices(uuid) TO authenticated;
