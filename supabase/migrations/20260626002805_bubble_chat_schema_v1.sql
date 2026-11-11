/*
# Bubble Chat Platform Schema - Part 1

Creates all base tables without cross-referencing policies.
Policies for conversations added in part 2 after all tables exist.

1. Tables: profiles, conversations, conversation_members, messages, typing_indicators,
   notifications, gifs, gif_collections, gif_collection_items
2. RLS enabled on all tables
3. Basic policies applied
*/

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  status text DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'offline')),
  status_message text DEFAULT '',
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  is_group boolean NOT NULL DEFAULT false,
  avatar_url text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversations_insert" ON conversations;
CREATE POLICY "conversations_insert" ON conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "conversations_delete" ON conversations;
CREATE POLICY "conversations_delete" ON conversations FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Conversation Members
CREATE TABLE IF NOT EXISTS conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conv_members_select" ON conversation_members;
CREATE POLICY "conv_members_select" ON conversation_members FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM conversation_members cm2 WHERE cm2.conversation_id = conversation_members.conversation_id AND cm2.user_id = auth.uid())
);
DROP POLICY IF EXISTS "conv_members_insert" ON conversation_members;
CREATE POLICY "conv_members_insert" ON conversation_members FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "conv_members_update" ON conversation_members;
CREATE POLICY "conv_members_update" ON conversation_members FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "conv_members_delete" ON conversation_members;
CREATE POLICY "conv_members_delete" ON conversation_members FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Now add conversation policies that depend on conversation_members
DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM conversation_members WHERE conversation_members.conversation_id = conversations.id AND conversation_members.user_id = auth.uid())
);
DROP POLICY IF EXISTS "conversations_update" ON conversations;
CREATE POLICY "conversations_update" ON conversations FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM conversation_members WHERE conversation_members.conversation_id = conversations.id AND conversation_members.user_id = auth.uid())
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'gif', 'voicemail', 'call_started', 'call_ended', 'file')),
  content text,
  gif_url text,
  media_url text,
  duration_seconds integer,
  reactions jsonb DEFAULT '{}',
  reply_to uuid REFERENCES messages(id),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM conversation_members WHERE conversation_members.conversation_id = messages.conversation_id AND conversation_members.user_id = auth.uid())
);
DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (SELECT 1 FROM conversation_members WHERE conversation_members.conversation_id = messages.conversation_id AND conversation_members.user_id = auth.uid())
);
DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id);
DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_delete" ON messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);

-- Typing indicators
CREATE TABLE IF NOT EXISTS typing_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "typing_select" ON typing_indicators;
CREATE POLICY "typing_select" ON typing_indicators FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM conversation_members WHERE conversation_members.conversation_id = typing_indicators.conversation_id AND conversation_members.user_id = auth.uid())
);
DROP POLICY IF EXISTS "typing_insert" ON typing_indicators;
CREATE POLICY "typing_insert" ON typing_indicators FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "typing_update" ON typing_indicators;
CREATE POLICY "typing_update" ON typing_indicators FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "typing_delete" ON typing_indicators;
CREATE POLICY "typing_delete" ON typing_indicators FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('message', 'call', 'facetime', 'voicemail', 'mention', 'reaction')),
  title text NOT NULL,
  body text,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifs_select" ON notifications;
CREATE POLICY "notifs_select" ON notifications FOR SELECT TO authenticated USING (auth.uid() = recipient_id);
DROP POLICY IF EXISTS "notifs_insert" ON notifications;
CREATE POLICY "notifs_insert" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notifs_update" ON notifications;
CREATE POLICY "notifs_update" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = recipient_id);
DROP POLICY IF EXISTS "notifs_delete" ON notifications;
CREATE POLICY "notifs_delete" ON notifications FOR DELETE TO authenticated USING (auth.uid() = recipient_id);

-- GIFs
CREATE TABLE IF NOT EXISTS gifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled GIF',
  url text NOT NULL,
  thumbnail_url text,
  tags text[] DEFAULT '{}',
  width integer,
  height integer,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE gifs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gifs_select" ON gifs;
CREATE POLICY "gifs_select" ON gifs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gifs_insert" ON gifs;
CREATE POLICY "gifs_insert" ON gifs FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
DROP POLICY IF EXISTS "gifs_update" ON gifs;
CREATE POLICY "gifs_update" ON gifs FOR UPDATE TO authenticated USING (auth.uid() = creator_id);
DROP POLICY IF EXISTS "gifs_delete" ON gifs;
CREATE POLICY "gifs_delete" ON gifs FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- GIF Collections
CREATE TABLE IF NOT EXISTS gif_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_group_collection boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE gif_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gif_collections_select" ON gif_collections;
CREATE POLICY "gif_collections_select" ON gif_collections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gif_collections_insert" ON gif_collections;
CREATE POLICY "gif_collections_insert" ON gif_collections FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "gif_collections_update" ON gif_collections;
CREATE POLICY "gif_collections_update" ON gif_collections FOR UPDATE TO authenticated USING (auth.uid() = created_by);
DROP POLICY IF EXISTS "gif_collections_delete" ON gif_collections;
CREATE POLICY "gif_collections_delete" ON gif_collections FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- GIF Collection Items
CREATE TABLE IF NOT EXISTS gif_collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES gif_collections(id) ON DELETE CASCADE,
  gif_id uuid NOT NULL REFERENCES gifs(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  UNIQUE(collection_id, gif_id)
);
ALTER TABLE gif_collection_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gif_coll_items_select" ON gif_collection_items;
CREATE POLICY "gif_coll_items_select" ON gif_collection_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "gif_coll_items_insert" ON gif_collection_items;
CREATE POLICY "gif_coll_items_insert" ON gif_collection_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = added_by);
DROP POLICY IF EXISTS "gif_coll_items_update" ON gif_collection_items;
CREATE POLICY "gif_coll_items_update" ON gif_collection_items FOR UPDATE TO authenticated USING (auth.uid() = added_by);
DROP POLICY IF EXISTS "gif_coll_items_delete" ON gif_collection_items;
CREATE POLICY "gif_coll_items_delete" ON gif_collection_items FOR DELETE TO authenticated USING (auth.uid() = added_by);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE typing_indicators;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
