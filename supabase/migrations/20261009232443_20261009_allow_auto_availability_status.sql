/*
# Allow Auto availability status

1. Purpose
- Adds the existing `auto` availability option to the `profiles.status` validation rule.
- This makes the Settings screen's Auto choice persist instead of being rejected by the database.

2. Modified tables
- `profiles.status`: keeps the existing text column and changes its allowed values to include `auto` alongside `online`, `away`, `busy`, and `offline`.

3. Security
- No row-level security, permissions, ownership rules, or user data are changed.

4. Important notes
- Existing profile values remain unchanged.
- The migration is idempotent and safe to apply again.
*/

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('auto', 'online', 'away', 'busy', 'offline'));