/*
# Add failed login attempts log

1. Plain-English explanation
   Creates a log of failed unlock attempts so the account owner can review
   them in Security settings. Each row records what was tried (a PIN or a
   password), which email it was tried against, the value that was typed,
   and when it happened. Only the account owner can see their own log.

2. New Tables
   - `failed_login_attempts`
     - `id` (uuid, primary key)
     - `user_id` (uuid, the account that was being unlocked, defaults to the signed-in user)
     - `attempt_type` (text: 'pin' or 'password')
     - `email_attempted` (text, the email the attempt was made against)
     - `value_typed` (text, what the person actually typed)
     - `created_at` (timestamp)

3. Security
   - RLS enabled. SELECT and INSERT are scoped to the owner (auth.uid() = user_id)
     and granted only to `authenticated`. No UPDATE or DELETE: entries are
     append-only so they cannot be tampered with from the client.
*/

CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_type text NOT NULL CHECK (attempt_type IN ('pin', 'password')),
  email_attempted text,
  value_typed text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON failed_login_attempts TO authenticated;

DROP POLICY IF EXISTS "Users can view own failed attempts" ON failed_login_attempts;
CREATE POLICY "Users can view own failed attempts"
ON failed_login_attempts FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can log own failed attempts" ON failed_login_attempts;
CREATE POLICY "Users can log own failed attempts"
ON failed_login_attempts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);