/*
# Add fingerprint_enabled column to profiles

## What this does
Adds a boolean `fingerprint_enabled` column to the `profiles` table so the app
can check whether the user has opted into fingerprint/biometric unlock.
When true, the lock screen shows a fingerprint scanner option alongside the PIN.

## Modified Tables
- `profiles` — added `fingerprint_enabled` (boolean, default false)

## Notes
1. This is a user preference, not a security-critical field — the actual
   biometric credentials are stored in `user_fingerprints`.
2. Defaults to false so existing users are unaffected until they opt in.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'fingerprint_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN fingerprint_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;
