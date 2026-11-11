/*
# Record the sender's language on each message

1. Modified Tables
- `messages`: new nullable column `sender_language` (text). It stores the language the sender had chosen in their profile at the moment the message was sent. Existing messages stay null.

2. Security
- Grants INSERT and SELECT on `sender_language` to `authenticated`, matching the column-level grants already used by the messages table.
- No policy changes.

3. Notes
- Null means the sender had no language set when the message was sent, so the app does not translate that message for its sender.
*/

ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_language text;

GRANT INSERT (sender_language) ON messages TO authenticated;
GRANT SELECT (sender_language) ON messages TO authenticated;
