/*
# Add cloud-synced chat drafts

1. Modified Tables
- `conversation_notification_settings`
- Adds `draft_text`, storing the current unsent message for one signed-in user and one conversation.

2. Security
- Existing authenticated-only grants and user-owned row-level policies continue to protect the draft.
- Draft contents are never readable by another user.

3. Notes
- Existing rows default to an empty draft.
- This reuses the existing per-user, per-conversation settings record and does not alter messages.
*/

ALTER TABLE conversation_notification_settings
  ADD COLUMN IF NOT EXISTS draft_text text NOT NULL DEFAULT '';