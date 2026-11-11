/*
# Add unread badge setting to profiles

1. Purpose
- Adds an `unread_badge_enabled` boolean column to `profiles` so users can opt in
  to seeing unread chat counts in the browser tab title.
- Defaults to false (off) as requested.

2. Modified tables
- `profiles`: adds `unread_badge_enabled boolean NOT NULL DEFAULT false`.

3. Security
- No RLS, policy, or permission changes. The column is owner-writable via
  existing UPDATE policies on profiles.

4. Important notes
- Existing profiles get the default value `false` automatically.
- The migration is idempotent — safe to re-run.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'unread_badge_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN unread_badge_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;