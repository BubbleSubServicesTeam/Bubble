/*
# Fantasy Football Leagues

1. New Tables
- `ff_leagues`, `ff_league_members`, `ff_players`, `ff_rosters`,
  `ff_draft_picks`, `ff_chat_messages`, `ff_matchups`
2. Security
- RLS enabled on every table.
- League members can read league data; only the owner can modify league settings.
3. Notes
- The `ff_players` table is populated by an edge function that fetches live stats.
*/

-- ── Leagues ──
CREATE TABLE IF NOT EXISTS ff_leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid,
  draft_time timestamptz,
  draft_status text NOT NULL DEFAULT 'not_started',
  current_pick_index int NOT NULL DEFAULT 0,
  season int NOT NULL DEFAULT 2026,
  num_teams int NOT NULL DEFAULT 10,
  roster_size int NOT NULL DEFAULT 16,
  qb_count int NOT NULL DEFAULT 1,
  rb_count int NOT NULL DEFAULT 2,
  wr_count int NOT NULL DEFAULT 2,
  te_count int NOT NULL DEFAULT 1,
  k_count int NOT NULL DEFAULT 1,
  def_count int NOT NULL DEFAULT 1,
  flex_count int NOT NULL DEFAULT 1,
  bench_count int NOT NULL DEFAULT 6,
  pass_td_pts numeric NOT NULL DEFAULT 4,
  pass_yd_pts numeric NOT NULL DEFAULT 0.04,
  int_pts numeric NOT NULL DEFAULT -2,
  rush_td_pts numeric NOT NULL DEFAULT 6,
  rush_yd_pts numeric NOT NULL DEFAULT 0.1,
  rec_td_pts numeric NOT NULL DEFAULT 6,
  rec_yd_pts numeric NOT NULL DEFAULT 0.1,
  rec_pts numeric NOT NULL DEFAULT 0.5,
  fumble_pts numeric NOT NULL DEFAULT -2,
  two_pt_pts numeric NOT NULL DEFAULT 2,
  def_td_pts numeric NOT NULL DEFAULT 6,
  def_sack_pts numeric NOT NULL DEFAULT 1,
  def_int_pts numeric NOT NULL DEFAULT 2,
  def_fum_pts numeric NOT NULL DEFAULT 2,
  def_safty_pts numeric NOT NULL DEFAULT 2,
  def_pts_allowed_0 numeric NOT NULL DEFAULT 10,
  def_pts_allowed_1_6 numeric NOT NULL DEFAULT 7,
  def_pts_allowed_7_13 numeric NOT NULL DEFAULT 4,
  def_pts_allowed_14_20 numeric NOT NULL DEFAULT 1,
  def_pts_allowed_21_27 numeric NOT NULL DEFAULT 0,
  def_pts_allowed_28_34 numeric NOT NULL DEFAULT -1,
  def_pts_allowed_35_plus numeric NOT NULL DEFAULT -4,
  fg_0_39 numeric NOT NULL DEFAULT 3,
  fg_40_49 numeric NOT NULL DEFAULT 4,
  fg_50_plus numeric NOT NULL DEFAULT 5,
  xp_pts numeric NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── League Members ──
CREATE TABLE IF NOT EXISTS ff_league_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES ff_leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_name text NOT NULL DEFAULT 'My Team',
  draft_position int NOT NULL DEFAULT 0,
  wins int NOT NULL DEFAULT 0,
  losses int NOT NULL DEFAULT 0,
  ties int NOT NULL DEFAULT 0,
  points_for numeric NOT NULL DEFAULT 0,
  points_against numeric NOT NULL DEFAULT 0,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(league_id, user_id)
);

-- ── NFL Players ──
CREATE TABLE IF NOT EXISTS ff_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id text UNIQUE NOT NULL,
  name text NOT NULL,
  team text,
  position text,
  jersey int,
  height text,
  weight int,
  college text,
  live_points numeric NOT NULL DEFAULT 0,
  projected_points numeric NOT NULL DEFAULT 0,
  week int NOT NULL DEFAULT 1,
  season int NOT NULL DEFAULT 2026,
  updated_at timestamptz DEFAULT now()
);

-- ── Rosters ──
CREATE TABLE IF NOT EXISTS ff_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES ff_leagues(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES ff_league_members(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES ff_players(id) ON DELETE CASCADE,
  roster_slot text,
  is_starter boolean NOT NULL DEFAULT false,
  acquired_at timestamptz DEFAULT now(),
  UNIQUE(league_id, player_id)
);

-- ── Draft Picks ──
CREATE TABLE IF NOT EXISTS ff_draft_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES ff_leagues(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES ff_league_members(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES ff_players(id) ON DELETE CASCADE,
  round int NOT NULL,
  pick_number int NOT NULL,
  picked_at timestamptz DEFAULT now()
);

-- ── Chat Messages ──
CREATE TABLE IF NOT EXISTS ff_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES ff_leagues(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  message_type text NOT NULL DEFAULT 'text',
  player_id uuid,
  created_at timestamptz DEFAULT now()
);

-- ── Matchups ──
CREATE TABLE IF NOT EXISTS ff_matchups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES ff_leagues(id) ON DELETE CASCADE,
  week int NOT NULL,
  home_member_id uuid NOT NULL REFERENCES ff_league_members(id) ON DELETE CASCADE,
  away_member_id uuid NOT NULL REFERENCES ff_league_members(id) ON DELETE CASCADE,
  home_score numeric NOT NULL DEFAULT 0,
  away_score numeric NOT NULL DEFAULT 0,
  winner_id uuid REFERENCES ff_league_members(id) ON DELETE SET NULL,
  is_complete boolean NOT NULL DEFAULT false,
  UNIQUE(league_id, week, home_member_id, away_member_id)
);

-- ── Enable RLS ──
ALTER TABLE ff_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_matchups ENABLE ROW LEVEL SECURITY;

-- ── ff_leagues policies ──
DROP POLICY IF EXISTS "select_ff_leagues" ON ff_leagues;
CREATE POLICY "select_ff_leagues" ON ff_leagues FOR SELECT
  TO authenticated USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM ff_league_members m WHERE m.league_id = ff_leagues.id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_ff_leagues" ON ff_leagues;
CREATE POLICY "insert_ff_leagues" ON ff_leagues FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "update_ff_leagues" ON ff_leagues;
CREATE POLICY "update_ff_leagues" ON ff_leagues FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "delete_ff_leagues" ON ff_leagues;
CREATE POLICY "delete_ff_leagues" ON ff_leagues FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- ── ff_league_members policies ──
DROP POLICY IF EXISTS "select_ff_league_members" ON ff_league_members;
CREATE POLICY "select_ff_league_members" ON ff_league_members FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_league_members.league_id AND l.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM ff_league_members m2 WHERE m2.league_id = ff_league_members.league_id AND m2.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_ff_league_members" ON ff_league_members;
CREATE POLICY "insert_ff_league_members" ON ff_league_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = league_id)
  );

DROP POLICY IF EXISTS "update_ff_league_members" ON ff_league_members;
CREATE POLICY "update_ff_league_members" ON ff_league_members FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_ff_league_members" ON ff_league_members;
CREATE POLICY "delete_ff_league_members" ON ff_league_members FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_league_members.league_id AND l.owner_id = auth.uid())
  );

-- ── ff_players policies ──
DROP POLICY IF EXISTS "select_ff_players" ON ff_players;
CREATE POLICY "select_ff_players" ON ff_players FOR SELECT
  TO authenticated USING (true);

-- ── ff_rosters policies ──
DROP POLICY IF EXISTS "select_ff_rosters" ON ff_rosters;
CREATE POLICY "select_ff_rosters" ON ff_rosters FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_rosters.member_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM ff_league_members m2 WHERE m2.league_id = ff_rosters.league_id AND m2.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_ff_rosters" ON ff_rosters;
CREATE POLICY "insert_ff_rosters" ON ff_rosters FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_rosters.member_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_ff_rosters" ON ff_rosters;
CREATE POLICY "update_ff_rosters" ON ff_rosters FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_rosters.member_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_rosters.member_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_ff_rosters" ON ff_rosters;
CREATE POLICY "delete_ff_rosters" ON ff_rosters FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_rosters.member_id AND m.user_id = auth.uid())
  );

-- ── ff_draft_picks policies ──
DROP POLICY IF EXISTS "select_ff_draft_picks" ON ff_draft_picks;
CREATE POLICY "select_ff_draft_picks" ON ff_draft_picks FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.league_id = ff_draft_picks.league_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_ff_draft_picks" ON ff_draft_picks;
CREATE POLICY "insert_ff_draft_picks" ON ff_draft_picks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_draft_picks.member_id AND m.user_id = auth.uid())
  );

-- ── ff_chat_messages policies ──
DROP POLICY IF EXISTS "select_ff_chat_messages" ON ff_chat_messages;
CREATE POLICY "select_ff_chat_messages" ON ff_chat_messages FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.league_id = ff_chat_messages.league_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_ff_chat_messages" ON ff_chat_messages;
CREATE POLICY "insert_ff_chat_messages" ON ff_chat_messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.league_id = ff_chat_messages.league_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_ff_chat_messages" ON ff_chat_messages;
CREATE POLICY "delete_ff_chat_messages" ON ff_chat_messages FOR DELETE
  TO authenticated USING (sender_id = auth.uid());

-- ── ff_matchups policies ──
DROP POLICY IF EXISTS "select_ff_matchups" ON ff_matchups;
CREATE POLICY "select_ff_matchups" ON ff_matchups FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.league_id = ff_matchups.league_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_ff_matchups" ON ff_matchups;
CREATE POLICY "update_ff_matchups" ON ff_matchups FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_matchups.league_id AND l.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_matchups.league_id AND l.owner_id = auth.uid())
  );

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_ff_league_members_league ON ff_league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_ff_league_members_user ON ff_league_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ff_rosters_league ON ff_rosters(league_id);
CREATE INDEX IF NOT EXISTS idx_ff_rosters_member ON ff_rosters(member_id);
CREATE INDEX IF NOT EXISTS idx_ff_draft_picks_league ON ff_draft_picks(league_id);
CREATE INDEX IF NOT EXISTS idx_ff_chat_messages_league ON ff_chat_messages(league_id);
CREATE INDEX IF NOT EXISTS idx_ff_matchups_league_week ON ff_matchups(league_id, week);
CREATE INDEX IF NOT EXISTS idx_ff_players_position ON ff_players(position);
