/*
# Add text effects to messages

1. Modified Tables
- `messages`: new nullable column `text_effect` that stores an optional animated text effect chosen when a text message is sent (big, small, bump, shake, wave, glow). Null means a normal message.

2. Security
- No new policies. Existing message read and insert rules already cover the new column.
- The column is constrained to the known effect names so arbitrary values cannot be stored.

3. Important Notes
- Existing messages are unaffected; the column defaults to null.
*/

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS text_effect text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_text_effect_check'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_text_effect_check
      CHECK (text_effect IS NULL OR text_effect IN ('big', 'small', 'bump', 'shake', 'wave', 'glow'));
  END IF;
END $$;
