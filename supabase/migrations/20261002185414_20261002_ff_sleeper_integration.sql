/*
# Fantasy Football: Sleeper Integration Enhancements

## Changes
1. New columns on `ff_leagues`: `sleeper_league_id` (text, nullable) to link a Bubble league to a real Sleeper league.
2. New columns on `ff_players`: `age`, `years_exp`, `status`, `injury_status`, `injury_body_part`, `injury_notes`, `news_updated`, `depth_chart_order`, `depth_chart_position`, `search_rank` — richer player data from Sleeper.
3. New table `ff_trades` — trade proposals between league members with offered/requested players and status tracking.
4. New table `ff_waiver_claims` — waiver wire claims for players.
5. RLS policies on new tables.

## Notes
- All new columns are nullable / have defaults so existing rows are unaffected.
- The `sleeper_league_id` column lets users import their real Sleeper league into Bubble.
*/

-- ── Add sleeper_league_id to ff_leagues ──
ALTER TABLE ff_leagues ADD COLUMN IF NOT EXISTS sleeper_league_id text;
ALTER TABLE ff_leagues ADD COLUMN IF NOT EXISTS sleeper_username text;

-- ── Add richer player fields to ff_players ──
ALTER TABLE ff_players ADD COLUMN IF NOT EXISTS age int;
ALTER TABLE ff_players ADD COLUMN IF NOT EXISTS years_exp int;
ALTER TABLE ff_players ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE ff_players ADD COLUMN IF NOT EXISTS injury_status text;
ALTER TABLE ff_players ADD COLUMN IF NOT EXISTS injury_body_part text;
ALTER TABLE ff_players ADD COLUMN IF NOT EXISTS injury_notes text;
ALTER TABLE ff_players ADD COLUMN IF NOT EXISTS news_updated bigint;
ALTER TABLE ff_players ADD COLUMN IF NOT EXISTS depth_chart_order int;
ALTER TABLE ff_players ADD COLUMN IF NOT EXISTS depth_chart_position text;
ALTER TABLE ff_players ADD COLUMN IF NOT EXISTS search_rank int;

-- ── Trades table ──
CREATE TABLE IF NOT EXISTS ff_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES ff_leagues(id) ON DELETE CASCADE,
  proposer_member_id uuid NOT NULL REFERENCES ff_league_members(id) ON DELETE CASCADE,
  target_member_id uuid NOT NULL REFERENCES ff_league_members(id) ON DELETE CASCADE,
  offered_player_ids text[] NOT NULL DEFAULT '{}',
  requested_player_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  proposed_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- ── Waiver claims table ──
CREATE TABLE IF NOT EXISTS ff_waiver_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES ff_leagues(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES ff_league_members(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  drop_player_id text,
  priority int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  claimed_at timestamptz DEFAULT now()
);

-- ── Enable RLS on new tables ──
ALTER TABLE ff_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_waiver_claims ENABLE ROW LEVEL SECURITY;

-- ── ff_trades policies ──
DROP POLICY IF EXISTS "select_ff_trades" ON ff_trades;
CREATE POLICY "select_ff_trades" ON ff_trades FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.league_id = ff_trades.league_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_ff_trades" ON ff_trades;
CREATE POLICY "insert_ff_trades" ON ff_trades FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_trades.proposer_member_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_ff_trades" ON ff_trades;
CREATE POLICY "update_ff_trades" ON ff_trades FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.league_id = ff_trades.league_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.league_id = ff_trades.league_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_ff_trades" ON ff_trades;
CREATE POLICY "delete_ff_trades" ON ff_trades FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_trades.proposer_member_id AND m.user_id = auth.uid())
  );

-- ── ff_waiver_claims policies ──
DROP POLICY IF EXISTS "select_ff_waiver_claims" ON ff_waiver_claims;
CREATE POLICY "select_ff_waiver_claims" ON ff_waiver_claims FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.league_id = ff_waiver_claims.league_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_ff_waiver_claims" ON ff_waiver_claims;
CREATE POLICY "insert_ff_waiver_claims" ON ff_waiver_claims FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_waiver_claims.member_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_ff_waiver_claims" ON ff_waiver_claims;
CREATE POLICY "delete_ff_waiver_claims" ON ff_waiver_claims FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_waiver_claims.member_id AND m.user_id = auth.uid())
  );

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_ff_trades_league ON ff_trades(league_id);
CREATE INDEX IF NOT EXISTS idx_ff_trades_target ON ff_trades(target_member_id);
CREATE INDEX IF NOT EXISTS idx_ff_waiver_claims_league ON ff_waiver_claims(league_id);
CREATE INDEX IF NOT EXISTS idx_ff_leagues_sleeper ON ff_leagues(sleeper_league_id);
