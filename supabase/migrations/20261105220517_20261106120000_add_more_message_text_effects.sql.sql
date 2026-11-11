/*
# Add more text effects to messages

1. Modified Tables
- `messages`: the allowed values for `text_effect` now include rainbow, neon, and jiggle, in addition to big, small, bump, shake, wave, and glow.

2. Security
- No changes to RLS, policies, or grants.

3. Notes
- Existing messages keep their current effects. Null still means a normal message.
*/

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_text_effect_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_text_effect_check
  CHECK (text_effect IS NULL OR text_effect IN ('big', 'small', 'bump', 'shake', 'wave', 'glow', 'rainbow', 'neon', 'jiggle'));
