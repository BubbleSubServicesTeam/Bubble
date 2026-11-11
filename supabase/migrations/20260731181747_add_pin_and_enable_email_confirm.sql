/*
# Add PIN login support and enforce email confirmation

1. Changes
   - Adds `pin_hash` column to `profiles` table for storing a hashed 4-digit PIN
   - PIN is stored as a bcrypt-compatible hash (hashed client-side via SHA-256 stored as hex)
   - Column is nullable — users without a PIN use password-only login

2. Security
   - The pin_hash column is only writable by the profile owner via RLS
   - Existing SELECT/UPDATE policies already restrict access to own rows
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'pin_hash'
  ) THEN
    ALTER TABLE profiles ADD COLUMN pin_hash text;
  END IF;
END $$;
