/*
# Restore profile read access for admin flags

1. Problem
- The app loads the signed-in user's profile with a list of columns that includes `is_admin` and `is_suspended`.
- Those two columns had no SELECT privilege for the `authenticated` role, so the entire profile read failed.
- The app then fell back to a blank profile, which hid the profile photo, PIN lock, and settings.

2. Change
- Grants SELECT on `is_admin` and `is_suspended` in `profiles` to `authenticated`.

3. Security
- Only SELECT is granted. Clients still cannot change these columns; the existing `protect_profile_admin_fields` trigger and column-level privileges continue to block writes.
- No policies or other privileges change.
*/

GRANT SELECT (is_admin, is_suspended) ON public.profiles TO authenticated;
