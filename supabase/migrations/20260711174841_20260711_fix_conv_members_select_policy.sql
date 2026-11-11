-- Fix: allow members to see all other members in conversations they belong to
-- (needed to display names/avatars of people in shared conversations)

DROP POLICY IF EXISTS "conv_members_select_own" ON conversation_members;

CREATE POLICY "conv_members_select_member" ON conversation_members FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
      AND cm.user_id = auth.uid()
    )
  );
