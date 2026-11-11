/*
# Create API Keys table for external Bubble integration

1. New Tables
- `api_keys`
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner of the key, defaults to auth.uid(), FK to auth.users)
  - `key_hash` (text, NOT NULL — SHA-256 hash of the key, never store the raw key)
  - `key_prefix` (text — first 8 chars of the key for display, e.g. "bub_a1b2")
  - `name` (text — user-friendly label for the key, e.g. "My Discord Bot")
  - `permissions` (text[], default '{}' — list of scopes: 'send_message', 'read_messages')
  - `last_used_at` (timestamptz, nullable — updated when the key is used)
  - `created_at` (timestamptz, default now())
  - `revoked_at` (timestamptz, nullable — set when key is revoked)

2. Security
- Enable RLS on `api_keys`.
- Owner-scoped CRUD: each authenticated user can only manage their own API keys.
- The raw key is never stored — only the SHA-256 hash, so a database leak doesn't expose keys.

3. Important Notes
- Keys are formatted as "bub_<32 hex chars>" and shown to the user ONCE at creation time.
- The edge function verifies keys by hashing the incoming key and comparing to key_hash.
- Users can create, view (prefix only), and revoke keys from Settings.
*/

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  name text NOT NULL DEFAULT 'My API Key',
  permissions text[] NOT NULL DEFAULT '{send_message}',
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_api_keys" ON api_keys;
CREATE POLICY "select_own_api_keys" ON api_keys
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_api_keys" ON api_keys;
CREATE POLICY "insert_own_api_keys" ON api_keys
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_api_keys" ON api_keys;
CREATE POLICY "update_own_api_keys" ON api_keys
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_api_keys" ON api_keys;
CREATE POLICY "delete_own_api_keys" ON api_keys
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
