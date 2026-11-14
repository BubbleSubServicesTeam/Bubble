/*
# QR Login Tokens

## Purpose
Allows a user to generate a short-lived QR code that, when scanned by another device,
automatically logs that device into the same account. The QR code encodes a URL that
hits a special /qr-login/<token> route. The frontend calls the qr-login edge function
with the token, which exchanges it for a Supabase session.

## New Tables
- `qr_login_tokens`
  - `id` (uuid, PK)
  - `user_id` (uuid, FK auth.users) — the account this token logs into
  - `token` (text, unique) — random opaque token embedded in QR code
  - `expires_at` (timestptz) — 5 minutes from creation
  - `used_at` (timestamptz, nullable) — set when consumed (single-use)
  - `revoked_at` (timestamptz, nullable) — set if user revokes early
  - `created_at` (timestamptz)

## Security
- RLS enabled: users can only see/create tokens for their own account
- Single-use: once `used_at` is set, the token cannot be used again
- Short-lived: 5-minute expiry
- The edge function uses service_role to exchange the token for a session
- Token is 64 chars (two concatenated UUIDs with dashes removed)

## Notes
1. The edge function `qr-login` handles the actual session exchange.
2. The frontend generates the token via RPC `create_qr_login_token`, then displays the QR code.
3. The scanning device navigates to /qr-login/<token>, which calls the edge function.
*/

CREATE TABLE IF NOT EXISTS qr_login_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT (replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text)),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qr_login_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON qr_login_tokens TO authenticated;

DROP POLICY IF EXISTS "select_own_qr_tokens" ON qr_login_tokens;
CREATE POLICY "select_own_qr_tokens"
  ON qr_login_tokens FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_qr_tokens" ON qr_login_tokens;
CREATE POLICY "insert_own_qr_tokens"
  ON qr_login_tokens FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_qr_tokens" ON qr_login_tokens;
CREATE POLICY "update_own_qr_tokens"
  ON qr_login_tokens FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Function for a user to create their own QR login token
CREATE OR REPLACE FUNCTION create_qr_login_token()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO qr_login_tokens (user_id) VALUES (auth.uid()) RETURNING token;
$$;

GRANT EXECUTE ON FUNCTION create_qr_login_token() TO authenticated;

-- Function for user to revoke their own token
CREATE OR REPLACE FUNCTION revoke_qr_login_token(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE qr_login_tokens
  SET revoked_at = now()
  WHERE token = p_token AND user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION revoke_qr_login_token(text) TO authenticated;

-- Function to get active (non-expired, non-used, non-revoked) tokens for current user
CREATE OR REPLACE FUNCTION get_active_qr_login_tokens()
RETURNS TABLE (token text, created_at timestamptz, expires_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT token, created_at, expires_at
  FROM qr_login_tokens
  WHERE user_id = auth.uid()
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_active_qr_login_tokens() TO authenticated;

-- Cleanup function for the edge function to consume a token and return the user_id
-- This is SECURITY DEFINER so the edge function (service_role) can call it
CREATE OR REPLACE FUNCTION consume_qr_login_token(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_token_rec qr_login_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token_rec
  FROM qr_login_tokens
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_token_rec.used_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF v_token_rec.revoked_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF v_token_rec.expires_at <= now() THEN
    RETURN NULL;
  END IF;

  UPDATE qr_login_tokens
  SET used_at = now()
  WHERE id = v_token_rec.id;

  RETURN v_token_rec.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION consume_qr_login_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION consume_qr_login_token(text) TO service_role, authenticated;
