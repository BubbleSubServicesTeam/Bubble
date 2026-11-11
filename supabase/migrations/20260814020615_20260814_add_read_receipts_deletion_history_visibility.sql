/*
# Add read receipts, account deletion scheduling, group history visibility, and voluntary PIN tracking

1. New Columns
- `profiles.pin_voluntary` (boolean, default false): Tracks whether the PIN was set voluntarily from Settings (true) vs. from the forced setup flow (false). Only voluntary PINs lock the app on open.
- `profiles.deletion_scheduled_at` (timestamptz, nullable): When set, the account is scheduled for deletion 48 hours from this timestamp. Null means no deletion pending.
- `profiles.deletion_cancelled_at` (timestamptz, nullable): Records when a user cancelled a pending deletion.
- `conversations.history_visible_to_new_members` (boolean, default true): When false, new members joining a group chat can only see messages sent after they joined.

2. Modified Tables
- `profiles`: Added pin_voluntary, deletion_scheduled_at, deletion_cancelled_at columns
- `conversations`: Added history_visible_to_new_members column

3. Security
- No new tables. Existing RLS policies remain in effect.
- The new columns on `profiles` are user-writable (user can set pin_voluntary, and deletion_scheduled_at).
- The new column on `conversations` is writable by the conversation creator.

4. Important Notes
- Read receipts use the existing `conversation_members.last_read_at` column — no new table needed. A message is "read" by a member if their last_read_at >= message.created_at.
- Account deletion is a two-phase process: user schedules deletion, then a scheduled job (cron or edge function) completes it after 48 hours.
- The history_visible_to_new_members flag defaults to true (current behavior). When set to false, the message-loading query must filter messages to only those created after the member's joined_at.
*/

-- Add pin_voluntary to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pin_voluntary boolean NOT NULL DEFAULT false;

-- Add deletion scheduling columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_cancelled_at timestamptz;

-- Add history_visible_to_new_members to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS history_visible_to_new_members boolean NOT NULL DEFAULT true;

-- Add index for deletion scheduling queries
CREATE INDEX IF NOT EXISTS idx_profiles_deletion_scheduled
  ON profiles (deletion_scheduled_at)
  WHERE deletion_scheduled_at IS NOT NULL;
