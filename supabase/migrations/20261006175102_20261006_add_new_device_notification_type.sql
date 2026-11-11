/*
# Add 'new_device' notification type

1. Changes
- Alter the CHECK constraint on notifications.notification_type to include 'new_device'.
- This allows the device session tracker to insert notifications when a new device logs in.
2. Notes
- Drops the old constraint and recreates with the expanded list (preserving all existing types).
*/

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_notification_type_check
CHECK (notification_type IN ('message', 'call', 'facetime', 'voicemail', 'mention', 'reaction', 'new_device'));
