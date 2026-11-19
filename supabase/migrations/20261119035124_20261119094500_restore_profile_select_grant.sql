/*
# Restore signed-in profile reads

1. Purpose
- Restore the permission required for the signed-in Bubble client to load the current user's account profile in deployed browsers.
- The existing row-level policy already controls which profile rows are visible; this change restores the missing table-level SELECT privilege so that policy can be evaluated.

2. Modified Tables
- `profiles`
- No columns, rows, types, or existing policies are changed.

3. Security
- Grant SELECT only to `authenticated` users.
- Anonymous users receive no profile read access.
- Existing row-level security remains enabled and unchanged, including the existing profile visibility policy.

4. Important Notes
- This is intentionally limited to the missing read grant and does not broaden write permissions.
- The change is idempotent and safe to apply again.
*/

GRANT SELECT ON TABLE public.profiles TO authenticated;