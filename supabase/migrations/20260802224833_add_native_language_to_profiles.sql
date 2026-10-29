/*
# Add native_language column to profiles

1. New Columns
- `profiles.native_language` (text, nullable) — stores the user's preferred language code (e.g. 'en', 'es', 'fr').
  When set, the app auto-translates incoming messages written in a different language.

2. Security
- No new tables. Existing profiles RLS policies already cover UPDATE for authenticated owners.
- The column is user-editable via the existing update_own_profiles policy.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'native_language'
  ) THEN
    ALTER TABLE profiles ADD COLUMN native_language text;
  END IF;
END $$;
