/*
# Add Fingerprint / Biometric Authentication

## What this does
Adds a `user_fingerprints` table so users can register multiple biometric credentials
(fingerprint, Touch ID, Windows Hello) to unlock the app instead of typing their PIN.
Each fingerprint has a label (e.g. "My Thumb", "Spouse's Finger") so users can manage
and delete individual fingerprints.

## New Tables
- `user_fingerprints`
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users, ON DELETE CASCADE) — the account owner
  - `label` (text) — user-chosen name for this fingerprint
  - `credential_id` (text, not null) — WebAuthn credential ID (base64)
  - `public_key` (text) — WebAuthn public key (base64)
  - `created_at` (timestamptz, default now())

## Security
- RLS enabled on `user_fingerprints`.
- 4 separate CRUD policies, all scoped to `authenticated` with `auth.uid() = user_id`.
- Owner column has `DEFAULT auth.uid()` so inserts that omit `user_id` still succeed.

## Notes
1. This table stores WebAuthn credential references, not actual fingerprint images.
2. The biometric data never leaves the device — only the credential ID and public key are stored.
3. Multiple rows per user are allowed (for adding trusted contacts' fingerprints).
*/

CREATE TABLE IF NOT EXISTS user_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'My Fingerprint',
  credential_id text NOT NULL,
  public_key text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_fingerprints" ON user_fingerprints;
CREATE POLICY "select_own_fingerprints"
ON user_fingerprints FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_fingerprints" ON user_fingerprints;
CREATE POLICY "insert_own_fingerprints"
ON user_fingerprints FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_fingerprints" ON user_fingerprints;
CREATE POLICY "update_own_fingerprints"
ON user_fingerprints FOR UPDATE
TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_fingerprints" ON user_fingerprints;
CREATE POLICY "delete_own_fingerprints"
ON user_fingerprints FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
