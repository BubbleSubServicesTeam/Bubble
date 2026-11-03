/*
# Add per-chat opening position preference

1. Modified Tables
- `conversation_notification_settings`
- Adds `open_position`, allowing each signed-in user to choose whether a chat opens at the last-read message or at the newest messages.

2. Security
- Existing row-level security and authenticated-only grants remain in place.
- The new preference is protected by the table's existing user-owned policies.

3. Notes
- Existing rows default to `bottom`, preserving current behavior.
- Allowed values are `last_read` and `bottom`.
*/

ALTER TABLE conversation_notification_settings
  ADD COLUMN IF NOT EXISTS open_position text NOT NULL DEFAULT 'bottom';

ALTER TABLE conversation_notification_settings
  DROP CONSTRAINT IF EXISTS conversation_notification_settings_open_position_check;

ALTER TABLE conversation_notification_settings
  ADD CONSTRAINT conversation_notification_settings_open_position_check
  CHECK (open_position IN ('last_read', 'bottom'));