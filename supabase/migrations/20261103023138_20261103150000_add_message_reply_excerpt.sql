/*
# Preserve selected text in message replies

1. New Columns
- `messages.reply_excerpt`: Optional text copied from the selected message area when composing a reply.

2. Behavior
- Replies continue to reference the original message through `reply_to`.
- The selected excerpt is stored separately so the reply preview can show the exact selected text instead of only the full original message.
- Existing messages remain unchanged because the column is nullable.

3. Security
- No new tables, policies, or grants are introduced.
- Existing message access policies continue to protect this column with the rest of each message row.

4. Compatibility
- The change is additive and safe for existing messages and clients.
*/

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_excerpt text;