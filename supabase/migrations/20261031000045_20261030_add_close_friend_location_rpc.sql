/*
# Close friend location visibility

## Summary
Adds a read function that returns a person's city, state, postal code, country, and street address
only when that person has marked the caller as a close friend.

## Security
- SECURITY DEFINER with a fixed search_path.
- Returns no rows unless contact_preferences has is_close_friend = true for (user_id = target, contact_id = caller).
- EXECUTE is revoked from PUBLIC and anon; only authenticated users can call it.
*/

CREATE OR REPLACE FUNCTION public.get_close_friend_location(p_user_id uuid)
RETURNS TABLE (address text, city text, state text, postal_code text, country text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.address, p.city, p.state, p.postal_code, p.country
  FROM profiles p
  WHERE p.user_id = p_user_id
    AND EXISTS (
      SELECT 1 FROM contact_preferences cp
      WHERE cp.user_id = p_user_id
        AND cp.contact_id = auth.uid()
        AND cp.is_close_friend = true
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_close_friend_location(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_close_friend_location(uuid) TO authenticated;
