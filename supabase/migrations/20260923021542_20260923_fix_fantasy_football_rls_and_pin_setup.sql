/*
# Fix Fantasy Football RLS and PIN Setup

1. Problem: ff_league_members INSERT policy only allows user_id = auth.uid()
   - When a league owner creates a league and invites other users, the owner
     tries to INSERT rows for those invited users (with their user_ids).
   - The existing policy "insert_ff_league_members" has WITH CHECK (user_id = auth.uid()),
     which blocks inserting rows for OTHER users. This causes league creation to fail
     silently, and the linked group conversation never gets created properly.
2. Fix: Allow the league OWNER to insert member rows for any user_id into their own leagues.
   - The owner must be able to add invited members during league creation.
   - We add a condition: either the user is inserting themselves OR the user owns the league.
3. Also fix: ff_league_members UPDATE policy was too restrictive — only allowed user_id = auth.uid().
   The league owner needs to update member stats (wins, losses, points) for all members.
4. Also fix: ff_rosters INSERT/UPDATE policies only allow the roster owner. The league owner
   should also be able to manage rosters (e.g., during draft or score updates).
5. Also fix: ff_draft_picks — only the drafting member can insert. The league owner should
   also be able to insert picks (for auto-draft or admin operations).
6. Also fix: ff_chat_messages — only members can insert. This is correct but the policy
   should also allow the system (owner) to post system messages.
7. No new tables or columns. Only policy changes.
*/

-- ── Fix ff_league_members INSERT policy ──
-- Allow: (a) user inserting themselves, OR (b) league owner inserting any member
DROP POLICY IF EXISTS "insert_ff_league_members" ON ff_league_members;
CREATE POLICY "insert_ff_league_members" ON ff_league_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_league_members.league_id AND l.owner_id = auth.uid())
  );

-- ── Fix ff_league_members UPDATE policy ──
-- Allow: (a) user updating themselves, OR (b) league owner updating any member
DROP POLICY IF EXISTS "update_ff_league_members" ON ff_league_members;
CREATE POLICY "update_ff_league_members" ON ff_league_members FOR UPDATE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_league_members.league_id AND l.owner_id = auth.uid())
  ) WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_league_members.league_id AND l.owner_id = auth.uid())
  );

-- ── Fix ff_rosters INSERT policy ──
-- Allow: roster owner OR league owner
DROP POLICY IF EXISTS "insert_ff_rosters" ON ff_rosters;
CREATE POLICY "insert_ff_rosters" ON ff_rosters FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_rosters.member_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_rosters.league_id AND l.owner_id = auth.uid())
  );

-- ── Fix ff_rosters UPDATE policy ──
-- Allow: roster owner OR league owner
DROP POLICY IF EXISTS "update_ff_rosters" ON ff_rosters;
CREATE POLICY "update_ff_rosters" ON ff_rosters FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_rosters.member_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_rosters.league_id AND l.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_rosters.member_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_rosters.league_id AND l.owner_id = auth.uid())
  );

-- ── Fix ff_draft_picks INSERT policy ──
-- Allow: drafting member OR league owner
DROP POLICY IF EXISTS "insert_ff_draft_picks" ON ff_draft_picks;
CREATE POLICY "insert_ff_draft_picks" ON ff_draft_picks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.id = ff_draft_picks.member_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_draft_picks.league_id AND l.owner_id = auth.uid())
  );

-- ── Fix ff_chat_messages INSERT policy ──
-- Already allows any league member to insert. Also allow league owner (covers system messages).
DROP POLICY IF EXISTS "insert_ff_chat_messages" ON ff_chat_messages;
CREATE POLICY "insert_ff_chat_messages" ON ff_chat_messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM ff_league_members m WHERE m.league_id = ff_chat_messages.league_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_chat_messages.league_id AND l.owner_id = auth.uid())
  );

-- ── Fix ff_matchups INSERT policy (was missing entirely) ──
DROP POLICY IF EXISTS "insert_ff_matchups" ON ff_matchups;
CREATE POLICY "insert_ff_matchups" ON ff_matchups FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_matchups.league_id AND l.owner_id = auth.uid())
  );

-- ── Fix ff_matchups DELETE policy (was missing) ──
DROP POLICY IF EXISTS "delete_ff_matchups" ON ff_matchups;
CREATE POLICY "delete_ff_matchups" ON ff_matchups FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM ff_leagues l WHERE l.id = ff_matchups.league_id AND l.owner_id = auth.uid())
  );