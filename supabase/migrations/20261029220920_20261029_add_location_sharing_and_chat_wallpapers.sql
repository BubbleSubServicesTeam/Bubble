/*
# Add location sharing, chat wallpapers, and face_id support

## Summary
Adds opt-in location sharing between friends, a chat wallpaper system, and face_id authentication support.

## 1. New Tables
- `user_locations` — stores each user's current GPS coordinates and a timestamp.
  - `user_id` (uuid, PK + FK to auth.users) — the user whose location this is.
  - `latitude` (double precision, not null)
  - `longitude` (double precision, not null)
  - `accuracy` (double precision, nullable) — GPS accuracy in meters.
  - `updated_at` (timestamptz, default now())
- `location_shares` — opt-in grants: "user A allows user B to see user A's location."
  - `id` (uuid PK)
  - `granter_id` (uuid, FK to auth.users) — the user who allows viewing.
  - `viewer_id` (uuid, FK to auth.users) — the user who is allowed to view.
  - `enabled` (boolean, default true) — can be toggled on/off via the pill switch.
  - `created_at` (timestamptz, default now())
  - UNIQUE(granter_id, viewer_id) — one grant per pair.
- `chat_wallpapers` — per-conversation wallpaper preferences for each user.
  - `id` (uuid PK)
  - `conversation_id` (uuid, FK to conversations)
  - `user_id` (uuid, FK to auth.users) — per-user preference for the same conversation.
  - `wallpaper` (text, not null) — wallpaper identifier (preset name or 'none').
  - `created_at` (timestamptz, default now())
  - UNIQUE(conversation_id, user_id)

## 2. Modified Tables
- `profiles` — add `face_id_enabled` boolean column (default false) for Face ID auth.

## 3. Security (RLS + Grants)
- `user_locations`: RLS enabled. A user can SELECT/INSERT/UPDATE/DELETE only their own row (auth.uid() = user_id).
- `location_shares`: RLS enabled. A user can SELECT rows where they are the granter OR the viewer. INSERT/UPDATE/DELETE only where they are the granter (auth.uid() = granter_id).
- `chat_wallpapers`: RLS enabled. A user can CRUD only their own wallpaper rows (auth.uid() = user_id).
- `profiles` face_id_enabled column: covered by existing profiles UPDATE policy (auth.uid() = user_id).

## 4. Notes
1. Location is OFF by default. A user must explicitly toggle the pill in a friend's profile to grant access.
2. The granter stores their own coordinates in user_locations; the viewer reads them via location_shares join.
3. Chat wallpapers are per-user-per-conversation — each participant sees their own choice.
4. Face ID is stored as a boolean preference; the actual biometric enrollment uses the existing user_fingerprints table with a 'face_id' label.
*/

-- ============ user_locations ============
CREATE TABLE IF NOT EXISTS user_locations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON user_locations TO authenticated;

DROP POLICY IF EXISTS "select_own_location" ON user_locations;
CREATE POLICY "select_own_location" ON user_locations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_location" ON user_locations;
CREATE POLICY "insert_own_location" ON user_locations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_location" ON user_locations;
CREATE POLICY "update_own_location" ON user_locations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_location" ON user_locations;
CREATE POLICY "delete_own_location" ON user_locations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ location_shares ============
CREATE TABLE IF NOT EXISTS location_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  granter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(granter_id, viewer_id)
);

ALTER TABLE location_shares ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON location_shares TO authenticated;

DROP POLICY IF EXISTS "select_location_shares" ON location_shares;
CREATE POLICY "select_location_shares" ON location_shares FOR SELECT
  TO authenticated USING (auth.uid() = granter_id OR auth.uid() = viewer_id);

DROP POLICY IF EXISTS "insert_location_share" ON location_shares;
CREATE POLICY "insert_location_share" ON location_shares FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = granter_id);

DROP POLICY IF EXISTS "update_location_share" ON location_shares;
CREATE POLICY "update_location_share" ON location_shares FOR UPDATE
  TO authenticated USING (auth.uid() = granter_id) WITH CHECK (auth.uid() = granter_id);

DROP POLICY IF EXISTS "delete_location_share" ON location_shares;
CREATE POLICY "delete_location_share" ON location_shares FOR DELETE
  TO authenticated USING (auth.uid() = granter_id);

-- ============ chat_wallpapers ============
CREATE TABLE IF NOT EXISTS chat_wallpapers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallpaper text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE chat_wallpapers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON chat_wallpapers TO authenticated;

DROP POLICY IF EXISTS "select_own_wallpaper" ON chat_wallpapers;
CREATE POLICY "select_own_wallpaper" ON chat_wallpapers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_wallpaper" ON chat_wallpapers;
CREATE POLICY "insert_own_wallpaper" ON chat_wallpapers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_wallpaper" ON chat_wallpapers;
CREATE POLICY "update_own_wallpaper" ON chat_wallpapers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_wallpaper" ON chat_wallpapers;
CREATE POLICY "delete_own_wallpaper" ON chat_wallpapers FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ profiles: add face_id_enabled ============
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'face_id_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN face_id_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;