/*
# Add per-word text effect spans to messages

1. Modified Tables
- `messages`: new nullable column `text_effect_spans` (jsonb array) storing effects applied to highlighted parts of a text message. Each item holds a start index, end index, and effect name.

2. Security
- No new policies. Existing message read and insert rules already cover the new column.

3. Important Notes
- Null for messages without partial effects. Existing rows are unaffected.
*/

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS text_effect_spans jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_text_effect_spans_check'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_text_effect_spans_check
      CHECK (text_effect_spans IS NULL OR jsonb_typeof(text_effect_spans) = 'array');
  END IF;
END $$;
