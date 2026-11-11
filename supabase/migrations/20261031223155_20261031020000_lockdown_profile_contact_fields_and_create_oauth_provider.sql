/*
# Lock down profile contact fields + create Bubble OAuth provider tables

## Part 1: Restrict direct reads of contact fields on `profiles`

### Problem
The `profiles` SELECT policy is `USING (true)` for authenticated, and the column grant
gives `authenticated` SELECT on ALL columns. Any signed-in user can read another user's
`address`, `city`, `state`, `postal_code`, and `country` directly — bypassing the
close-friend gate enforced by `get_close_friend_location`.

### Fix
Revoke column-level SELECT on five sensitive columns (`address`, `city`, `state`,
`postal_code`, `country`) from `authenticated` and `anon`. Re-grant SELECT on the
remaining safe columns only. `phone_number` stays readable (intentional in the UI).

A new SECURITY DEFINER RPC `get_own_contact_info()` returns the caller's own five
restricted columns, so the owner can still read their own data.

### Columns restricted from direct SELECT
- address, city, state, postal_code, country

## Part 2: Bubble OAuth provider tables

### New tables
1. `oauth_clients` — apps registered by a Bubble user.
   - client_id (text, unique, prefixed `bub_client_`)
   - client_secret_hash (text, SHA-256)
   - name, redirect_uris (text[]), scopes (text[]), revoked_at, created_at
2. `oauth_authorization_codes` — short-lived (10 min) one-time codes.
   - code_hash, client_id, user_id, redirect_uri, scopes, expires_at, used_at
3. `oauth_access_tokens` — 1-hour tokens.
   - token_hash, client_id, user_id, scopes, expires_at, revoked_at

### Security
- All tables: RLS enabled, owner-scoped policies, granted to `authenticated` (+ `service_role`
  for edge functions).
*/

-- ============================================================
-- Part 1: Restrict profiles contact columns
-- ============================================================

REVOKE SELECT (address, city, state, postal_code, country) ON profiles FROM authenticated;
REVOKE SELECT (address, city, state, postal_code, country) ON profiles FROM anon;

GRANT SELECT (
  id, user_id, display_name, first_name, last_name, avatar_url,
  status, status_message, last_seen, created_at, native_language,
  push_show_preview, push_show_sender, pin_hash, pin_length, pin_voluntary,
  fingerprint_enabled, unlock_preference, deletion_scheduled_at, deletion_cancelled_at,
  phone_number, unread_badge_enabled, face_id_enabled, paypal_email
) ON profiles TO authenticated;

GRANT SELECT (
  id, user_id, display_name, first_name, last_name, avatar_url,
  status, status_message, last_seen, created_at, native_language,
  push_show_preview, push_show_sender, pin_hash, pin_length, pin_voluntary,
  fingerprint_enabled, unlock_preference, deletion_scheduled_at, deletion_cancelled_at,
  phone_number, unread_badge_enabled, face_id_enabled, paypal_email
) ON profiles TO anon;

-- RPC: get_own_contact_info() — owner reads their own restricted columns
CREATE OR REPLACE FUNCTION public.get_own_contact_info()
RETURNS TABLE (
  address text,
  city text,
  state text,
  postal_code text,
  country text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.address, p.city, p.state, p.postal_code, p.country
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_own_contact_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_contact_info() TO authenticated;

-- ============================================================
-- Part 2: OAuth provider tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text UNIQUE NOT NULL,
  client_secret_hash text NOT NULL,
  name text NOT NULL,
  redirect_uris text[] NOT NULL DEFAULT '{}',
  scopes text[] NOT NULL DEFAULT ARRAY['openid', 'profile', 'email'],
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_clients TO authenticated;
GRANT SELECT ON public.oauth_clients TO service_role;

DROP POLICY IF EXISTS "select_own_oauth_clients" ON public.oauth_clients;
CREATE POLICY "select_own_oauth_clients" ON public.oauth_clients FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_oauth_clients" ON public.oauth_clients;
CREATE POLICY "insert_own_oauth_clients" ON public.oauth_clients FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_oauth_clients" ON public.oauth_clients;
CREATE POLICY "update_own_oauth_clients" ON public.oauth_clients FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_oauth_clients" ON public.oauth_clients;
CREATE POLICY "delete_own_oauth_clients" ON public.oauth_clients FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Authorization codes
CREATE TABLE IF NOT EXISTS public.oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  redirect_uri text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['openid', 'profile', 'email'],
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_authorization_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.oauth_authorization_codes TO service_role;

DROP POLICY IF EXISTS "select_own_auth_codes" ON public.oauth_authorization_codes;
CREATE POLICY "select_own_auth_codes" ON public.oauth_authorization_codes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_auth_codes" ON public.oauth_authorization_codes;
CREATE POLICY "insert_own_auth_codes" ON public.oauth_authorization_codes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_auth_codes" ON public.oauth_authorization_codes;
CREATE POLICY "delete_own_auth_codes" ON public.oauth_authorization_codes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Access tokens
CREATE TABLE IF NOT EXISTS public.oauth_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['openid', 'profile', 'email'],
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE, DELETE ON public.oauth_access_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.oauth_access_tokens TO service_role;

DROP POLICY IF EXISTS "select_own_oauth_tokens" ON public.oauth_access_tokens;
CREATE POLICY "select_own_oauth_tokens" ON public.oauth_access_tokens FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_oauth_tokens" ON public.oauth_access_tokens;
CREATE POLICY "delete_own_oauth_tokens" ON public.oauth_access_tokens FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_hash ON public.oauth_access_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_hash ON public.oauth_authorization_codes (code_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id ON public.oauth_clients (client_id);
