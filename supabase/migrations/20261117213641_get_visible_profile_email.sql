/*
# Visible profile email with block guard

1. New Functions
- `get_visible_profile_email(p_user_id)`: returns the account email of the given
  profile, but only when that user has NOT blocked the caller. Returns NULL when
  blocked, when the profile does not exist, or when the caller asks for their own
  email is unnecessary (own email comes from the profile row as before).

2. Security
- SECURITY DEFINER with a fixed search path so it can read auth.users safely.
- Callable only by signed-in users.
- A user who has been blocked by the target always receives NULL.

Important notes
- This migration is idempotent.
*/

CREATE OR REPLACE FUNCTION public.get_visible_profile_email(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.email
  FROM auth.users u
  WHERE u.id = p_user_id
    AND p_user_id <> auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks
      WHERE blocker_id = p_user_id AND blocked_id = auth.uid()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_visible_profile_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_profile_email(uuid) TO authenticated;
