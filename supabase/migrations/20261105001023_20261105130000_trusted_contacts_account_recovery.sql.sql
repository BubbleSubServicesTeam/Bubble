/*
# Trusted contacts for account recovery

1. New Tables
- `trusted_contacts`: a signed-in user's chosen trusted people. Each row links an owner to one trusted user.
  - `owner_id` (uuid, defaults to the signed-in user)
  - `trusted_user_id` (uuid, the trusted person)
  - `created_at`
  - Unique per owner and trusted person; a user cannot trust themselves.

2. New Functions
- `find_profile_for_trust(identifier)`: signed-in users can look up another user by user ID, display name, or account email. Returns only the matched user ID and display name.
- `find_auth_user_by_email(email)`: server-only lookup used by the account recovery function to find the account that forgot its password.

3. Security
- RLS enabled on `trusted_contacts`.
- Owners can read, add, and remove only their own trusted contacts. No update is allowed.
- `find_auth_user_by_email` is not callable by anonymous or signed-in users, only by the server.
- `find_profile_for_trust` is callable by signed-in users only.
*/

CREATE TABLE IF NOT EXISTS trusted_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  trusted_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trusted_contacts_not_self CHECK (owner_id <> trusted_user_id),
  CONSTRAINT trusted_contacts_unique_pair UNIQUE (owner_id, trusted_user_id)
);

CREATE INDEX IF NOT EXISTS trusted_contacts_trusted_user_idx ON trusted_contacts (trusted_user_id);

ALTER TABLE trusted_contacts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON trusted_contacts TO authenticated;
GRANT SELECT ON trusted_contacts TO service_role;

DROP POLICY IF EXISTS "select_own_trusted_contacts" ON trusted_contacts;
CREATE POLICY "select_own_trusted_contacts" ON trusted_contacts FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "insert_own_trusted_contacts" ON trusted_contacts;
CREATE POLICY "insert_own_trusted_contacts" ON trusted_contacts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id AND trusted_user_id <> auth.uid());

DROP POLICY IF EXISTS "delete_own_trusted_contacts" ON trusted_contacts;
CREATE POLICY "delete_own_trusted_contacts" ON trusted_contacts FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.find_profile_for_trust(identifier text)
RETURNS TABLE (found_user_id uuid, found_display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT p.user_id, p.display_name
  FROM profiles p
  WHERE p.user_id <> auth.uid()
    AND (
      p.user_id::text = lower(trim(identifier))
      OR lower(p.display_name) = lower(trim(identifier))
      OR p.user_id IN (SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(trim(identifier)))
    )
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.find_profile_for_trust(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_profile_for_trust(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_auth_user_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id FROM auth.users u WHERE lower(u.email) = lower(trim(p_email)) LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.find_auth_user_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_by_email(text) TO service_role;
