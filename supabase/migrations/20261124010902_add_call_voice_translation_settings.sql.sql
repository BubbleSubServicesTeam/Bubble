/*
# Add call voice translation settings to profiles

1. Plain-English explanation
   Adds the user preferences needed for live voice translation on calls:
   - `call_voice_translation_enabled`: when on, speech spoken during a call is
     translated into each listener's language and spoken aloud in a natural
     voice on their device.
   - `call_voice_translation_secondary_language`: a secondary language the user
     already understands. Speech already in that language is NOT translated
     (played as the original voice) instead of being translated into the
     primary language.

2. Modified Tables
   - `profiles`: adds two new nullable columns
     - `call_voice_translation_enabled` (boolean, null = off)
     - `call_voice_translation_secondary_language` (text, ISO-639-1 code like 'es', null = none)

3. Security
   - No new tables. `profiles` already has RLS restricting updates to the row
     owner (auth.uid() = id), and `authenticated` already holds table-level
     UPDATE. The new columns are nullable booleans/text with no sensitive data
     and are user-chosen preferences; existing profile read policies already
     expose profiles to conversation peers (needed to know each listener's
     language).
   - Re-grant column-level UPDATE on the new columns to `authenticated` so the
     existing column-restricted grant list includes them.
*/
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'call_voice_translation_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN call_voice_translation_enabled boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'call_voice_translation_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN call_voice_translation_secondary_language text;
  END IF;
END $$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS call_voice_translation_secondary_language text;