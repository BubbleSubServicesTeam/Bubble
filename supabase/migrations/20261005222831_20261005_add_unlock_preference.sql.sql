/*
# Add unlock preference to profiles

1. Modified Tables
- `profiles`: adds `unlock_preference` column (text, default 'pin')
  - 'pin': user unlocks with PIN (fingerprint optional as shortcut)
  - 'fingerprint': user must unlock with fingerprint only (PIN hidden)
  - 'both': user can use either PIN or fingerprint

2. Security
- No new RLS policies needed — existing profile policies cover the new column.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'unlock_preference'
  ) THEN
    ALTER TABLE profiles ADD COLUMN unlock_preference text NOT NULL DEFAULT 'pin';
  END IF;
END $$;
