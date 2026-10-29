/*
# Add Contact Info Fields and Voicemail Captions

1. Changes to `profiles` table:
   - `phone_number` (text, nullable) — user's phone number for contact info
   - `address` (text, nullable) — user's street address for contact info

2. Changes to `messages` table:
   - `caption` (text, nullable) — auto-generated live caption for voicemail messages

3. Security:
   - No new tables created. Existing RLS policies on profiles and messages remain unchanged.
   - New columns inherit existing RLS policies automatically.

4. Notes:
   - These fields are optional and nullable — existing rows are unaffected.
   - The `caption` column stores speech-to-text transcription for voicemail messages.
   - The `phone_number` and `address` columns let users store contact details that show in their profile.
*/

-- Add contact info columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address text;

-- Add caption column to messages for voicemail transcriptions
ALTER TABLE messages ADD COLUMN IF NOT EXISTS caption text;
