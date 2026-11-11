/*
# Add first_name and last_name to profiles

1. Changes
  - Add `first_name` (text) column to profiles
  - Add `last_name` (text) column to profiles
  - Backfill existing rows: split display_name on first space into first_name / last_name
  - display_name is kept in sync for backwards compatibility

2. Notes
  - Both columns are nullable to not break existing rows during migration
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name text;

-- Backfill from existing display_name
UPDATE profiles
SET
  first_name = CASE
    WHEN display_name LIKE '% %' THEN split_part(display_name, ' ', 1)
    ELSE display_name
  END,
  last_name = CASE
    WHEN display_name LIKE '% %' THEN substring(display_name FROM position(' ' IN display_name) + 1)
    ELSE ''
  END
WHERE first_name IS NULL;
