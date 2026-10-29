/*
# Add device sessions table for tracking logged-in devices

1. New Tables
- `user_device_sessions`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, references auth.users on delete cascade)
  - `device_type` (text: 'iPhone/iPad', 'Android', 'Mobile', 'Desktop')
  - `browser` (text: 'Chrome', 'Safari', 'Firefox', 'Edge')
  - `os` (text: e.g. 'iOS', 'macOS', 'Windows', 'Android')
  - `is_current` (boolean, default false — updated on each sign-in)
  - `last_active_at` (timestamptz, default now())
  - `created_at` (timestamptz, default now())
  - `session_token_hint` (text — first 12 chars of access token for matching)

2. Security
- Enable RLS on `user_device_sessions`.
- Users can only read/delete their own device sessions.
- INSERT is done via the app on sign-in, scoped to the authenticated user.
- DELETE allows users to remotely log out other devices.

3. Notes
- The app inserts a new row on each sign-in with the device's user-agent info.
- When a user deletes a row (remote logout), the app also calls supabase.auth.signOut on that session.
- A notification is inserted into the notifications table when a new device is detected.
*/

CREATE TABLE IF NOT EXISTS user_device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_type text NOT NULL DEFAULT 'Desktop',
  browser text NOT NULL DEFAULT 'Unknown',
  os text NOT NULL DEFAULT 'Unknown',
  is_current boolean NOT NULL DEFAULT false,
  last_active_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  session_token_hint text
);

ALTER TABLE user_device_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sessions" ON user_device_sessions;
CREATE POLICY "select_own_sessions"
ON user_device_sessions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sessions" ON user_device_sessions;
CREATE POLICY "insert_own_sessions"
ON user_device_sessions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sessions" ON user_device_sessions;
CREATE POLICY "update_own_sessions"
ON user_device_sessions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sessions" ON user_device_sessions;
CREATE POLICY "delete_own_sessions"
ON user_device_sessions FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_device_sessions_user_id ON user_device_sessions(user_id);
