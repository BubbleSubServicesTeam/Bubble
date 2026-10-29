/*
# Fix infinite recursion in conversation_members RLS + security hardening

## Problem
The conv_members_select policy referenced conversation_members from within
a conversation_members policy (self-referential EXISTS subquery), causing
Postgres to enter infinite recursion when evaluating the policy.

## Fix
Use a security-definer function `is_conversation_member(uuid)` that bypasses
RLS when checking membership, breaking the recursion. All policies that need
to verify membership now call this function instead of querying the table directly.

## Changes
1. Create `is_conversation_member(conv_id uuid)` security-definer helper.
2. Replace conv_members_select policy — no more self-reference.
3. Replace conv_members_insert policy — uses helper instead of self-reference.
4. Replace conversations_select/update policies — use helper.
5. Replace messages_select/insert policies — use helper.
6. Replace typing_select policy — uses helper.
7. Allow self-messaging: notifications insert no longer blocks recipient = sender.
*/

-- Helper function: returns true if the current user is a member of conv_id.
-- SECURITY DEFINER so it runs with the function owner's privileges (bypasses RLS).
CREATE OR REPLACE FUNCTION is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv_id
      AND user_id = auth.uid()
  );
$$;

-- ── conversation_members ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "conv_members_select" ON conversation_members;
CREATE POLICY "conv_members_select" ON conversation_members
FOR SELECT TO authenticated
USING (is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "conv_members_insert" ON conversation_members;
CREATE POLICY "conv_members_insert" ON conversation_members
FOR INSERT TO authenticated
WITH CHECK (
  -- Adding yourself: always allowed
  user_id = auth.uid()
  OR
  -- Adding others: only if you're already a member (uses helper, not self-reference)
  is_conversation_member(conversation_id)
);

DROP POLICY IF EXISTS "conv_members_update" ON conversation_members;
CREATE POLICY "conv_members_update" ON conversation_members
FOR UPDATE TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "conv_members_delete" ON conversation_members;
CREATE POLICY "conv_members_delete" ON conversation_members
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ── conversations ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations
FOR SELECT TO authenticated
USING (is_conversation_member(id));

DROP POLICY IF EXISTS "conversations_update" ON conversations;
CREATE POLICY "conversations_update" ON conversations
FOR UPDATE TO authenticated
USING (is_conversation_member(id));

DROP POLICY IF EXISTS "conversations_insert" ON conversations;
CREATE POLICY "conversations_insert" ON conversations
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "conversations_delete" ON conversations;
CREATE POLICY "conversations_delete" ON conversations
FOR DELETE TO authenticated
USING (auth.uid() = created_by);

-- ── messages ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages
FOR SELECT TO authenticated
USING (is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND is_conversation_member(conversation_id)
);

DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages
FOR UPDATE TO authenticated
USING (auth.uid() = sender_id);

DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_delete" ON messages
FOR DELETE TO authenticated
USING (auth.uid() = sender_id);

-- ── typing_indicators ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "typing_select" ON typing_indicators;
CREATE POLICY "typing_select" ON typing_indicators
FOR SELECT TO authenticated
USING (is_conversation_member(conversation_id));

-- ── notifications: allow self-notification (for self-chat / testing) ──────────

DROP POLICY IF EXISTS "notifs_insert" ON notifications;
CREATE POLICY "notifs_insert" ON notifications
FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid());
