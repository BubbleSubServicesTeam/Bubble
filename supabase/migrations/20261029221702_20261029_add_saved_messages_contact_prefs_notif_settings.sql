/*
# Add saved messages, contact preferences, and notification settings

## Summary
Adds the ability to favorite/save individual messages and view only saved ones, per-contact notification preferences (silenced/normal/prioritized), and per-conversation notification settings (alert tone, mute).

## 1. New Tables

### saved_messages
- Stores a user's favorited/bookmarked messages per conversation.
- `id` (uuid PK)
- `user_id` (uuid, FK auth.users, DEFAULT auth.uid()) — the user who saved the message
- `message_id` (uuid, FK messages ON DELETE CASCADE) — the message that was saved
- `conversation_id` (uuid, FK conversations ON DELETE CASCADE) — for quick filtering
- `created_at` (timestamptz, default now())
- UNIQUE(user_id, message_id) — one save per user per message

### contact_preferences
- Per-user, per-contact priority setting (silenced/normal/prioritized).
- `id` (uuid PK)
- `user_id` (uuid, FK auth.users, DEFAULT auth.uid()) — the user making the setting
- `contact_id` (uuid, FK auth.users) — the contact being configured
- `priority` (text, NOT NULL DEFAULT 'normal') — 'silenced' | 'normal' | 'prioritized'
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())
- UNIQUE(user_id, contact_id)

### conversation_notification_settings
- Per-user, per-conversation notification preferences (alert tone, mute).
- `id` (uuid PK)
- `user_id` (uuid, FK auth.users, DEFAULT auth.uid()) — the user
- `conversation_id` (uuid, FK conversations ON DELETE CASCADE)
- `muted` (boolean, NOT NULL DEFAULT false) — whether notifications are muted
- `alert_tone` (text, NOT NULL DEFAULT 'default') — which alert sound to play
- `created_at` (timestamptz, default now())
- UNIQUE(user_id, conversation_id)

## 2. Security (RLS + Grants)
All tables use RLS with owner-scoped policies (`auth.uid() = user_id`).
- `saved_messages`: CRUD for authenticated users on their own saves.
- `contact_preferences`: CRUD for authenticated users on their own preferences.
- `conversation_notification_settings`: CRUD for authenticated users on their own settings.

## 3. Notes
1. Saved messages are per-user — each user has their own favorites.
2. Contact preferences let users silence specific contacts: silenced contacts produce no unread badges, no push notifications, no nudge, and their messages sort to the bottom.
3. Conversation notification settings allow muting and choosing alert tones per chat.
*/
CREATE TABLE IF NOT EXISTS saved_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_id)
);
ALTER TABLE saved_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_messages TO authenticated;
DROP POLICY IF EXISTS "select_own_saved" ON saved_messages;
CREATE POLICY "select_own_saved" ON saved_messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_saved" ON saved_messages;
CREATE POLICY "insert_own_saved" ON saved_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_saved" ON saved_messages;
CREATE POLICY "update_own_saved" ON saved_messages FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_saved" ON saved_messages;
CREATE POLICY "delete_own_saved" ON saved_messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_saved_messages_user_conv ON saved_messages(user_id, conversation_id);

CREATE TABLE IF NOT EXISTS contact_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('silenced', 'normal', 'prioritized')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_id)
);
ALTER TABLE contact_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_preferences TO authenticated;
DROP POLICY IF EXISTS "select_own_contact_prefs" ON contact_preferences;
CREATE POLICY "select_own_contact_prefs" ON contact_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_contact_prefs" ON contact_preferences;
CREATE POLICY "insert_own_contact_prefs" ON contact_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_contact_prefs" ON contact_preferences;
CREATE POLICY "update_own_contact_prefs" ON contact_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_contact_prefs" ON contact_preferences;
CREATE POLICY "delete_own_contact_prefs" ON contact_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS conversation_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  muted boolean NOT NULL DEFAULT false,
  alert_tone text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, conversation_id)
);
ALTER TABLE conversation_notification_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversation_notification_settings TO authenticated;
DROP POLICY IF EXISTS "select_own_conv_notif" ON conversation_notification_settings;
CREATE POLICY "select_own_conv_notif" ON conversation_notification_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_conv_notif" ON conversation_notification_settings;
CREATE POLICY "insert_own_conv_notif" ON conversation_notification_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_conv_notif" ON conversation_notification_settings;
CREATE POLICY "update_own_conv_notif" ON conversation_notification_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_conv_notif" ON conversation_notification_settings;
CREATE POLICY "delete_own_conv_notif" ON conversation_notification_settings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);