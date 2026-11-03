/*
# Per-person visibility for phone number and address

Plain-English summary:
Each person can now choose who sees their phone number and their address:
everyone, close friends only, or nobody. Their own data is always visible to them.

1. Modified tables
- profiles: new column phone_visibility (default 'everyone', matching the existing behaviour).
- profiles: new column address_visibility (default 'close_friends', matching the existing behaviour
  for address, city, state, postal code and country).

2. Functions
- get_profile_contact_info(p_user_id): returns phone number and address fields for a person,
  but only the fields the viewer is allowed to see under that person's settings.
- get_own_contact_info(): now also returns phone_number.
- get_close_friend_location(): removed, replaced by get_profile_contact_info.

3. Security
- Direct reads of phone_number, address, city, state, postal_code and country are revoked from
  the anon and authenticated roles. All other profile columns keep their existing access.
- Contact data can only be read through the two RPCs above, which enforce the visibility rules.
- RPCs are executable by signed-in users only.

4. Notes
- Close friend check uses contact_preferences.is_close_friend, same as before.
- The visibility columns are validated with CHECK constraints.
- This migration is idempotent and can be re-run safely.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_visibility text NOT NULL DEFAULT 'everyone';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_visibility text NOT NULL DEFAULT 'close_friends';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_phone_visibility_check') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_phone_visibility_check
      CHECK (phone_visibility IN ('everyone', 'close_friends', 'nobody'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_address_visibility_check') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_address_visibility_check
      CHECK (address_visibility IN ('everyone', 'close_friends', 'nobody'));
  END IF;
END $$;

DO $$
DECLARE
  safe_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO safe_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name NOT IN ('phone_number', 'address', 'city', 'state', 'postal_code', 'country');

  REVOKE SELECT ON profiles FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON profiles TO anon, authenticated', safe_cols);
END $$;

DROP FUNCTION IF EXISTS get_close_friend_location(uuid);
DROP FUNCTION IF EXISTS get_own_contact_info();

CREATE FUNCTION get_own_contact_info()
RETURNS TABLE(phone_number text, address text, city text, state text, postal_code text, country text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phone_number, p.address, p.city, p.state, p.postal_code, p.country
  FROM profiles p
  WHERE p.user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION get_own_contact_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_own_contact_info() TO authenticated;

CREATE OR REPLACE FUNCTION get_profile_contact_info(p_user_id uuid)
RETURNS TABLE(phone_number text, address text, city text, state text, postal_code text, country text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT
      p.user_id,
      p.phone_number AS t_phone,
      p.phone_visibility AS t_phone_vis,
      p.address AS t_address,
      p.city AS t_city,
      p.state AS t_state,
      p.postal_code AS t_postal,
      p.country AS t_country,
      p.address_visibility AS t_address_vis,
      (p.user_id = auth.uid()) AS is_self,
      EXISTS (
        SELECT 1 FROM contact_preferences cp
        WHERE cp.user_id = p.user_id
          AND cp.contact_id = auth.uid()
          AND cp.is_close_friend = true
      ) AS is_close_friend
    FROM profiles p
    WHERE p.user_id = p_user_id
  )
  SELECT
    CASE WHEN t.is_self OR t.t_phone_vis = 'everyone' OR (t.t_phone_vis = 'close_friends' AND t.is_close_friend) THEN t.t_phone END,
    CASE WHEN t.is_self OR t.t_address_vis = 'everyone' OR (t.t_address_vis = 'close_friends' AND t.is_close_friend) THEN t.t_address END,
    CASE WHEN t.is_self OR t.t_address_vis = 'everyone' OR (t.t_address_vis = 'close_friends' AND t.is_close_friend) THEN t.t_city END,
    CASE WHEN t.is_self OR t.t_address_vis = 'everyone' OR (t.t_address_vis = 'close_friends' AND t.is_close_friend) THEN t.t_state END,
    CASE WHEN t.is_self OR t.t_address_vis = 'everyone' OR (t.t_address_vis = 'close_friends' AND t.is_close_friend) THEN t.t_postal END,
    CASE WHEN t.is_self OR t.t_address_vis = 'everyone' OR (t.t_address_vis = 'close_friends' AND t.is_close_friend) THEN t.t_country END
  FROM target t;
$$;

REVOKE EXECUTE ON FUNCTION get_profile_contact_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_profile_contact_info(uuid) TO authenticated;
