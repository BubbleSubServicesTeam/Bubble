-- ============================================================
-- Fix: restore is_conversation_member as SECURITY DEFINER to
-- break RLS recursion (which caused "Unknown" names), while
-- revoking EXECUTE from anon to fix the public exposure issue.
-- create_conversation stays SECURITY INVOKER (already fixed).
-- ============================================================

-- 1. Drop the self-referential policies that cause infinite recursion
DROP POLICY IF EXISTS "conv_members_select_member" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_insert_own" ON conversation_members;
DROP POLICY IF EXISTS "conversations_select_member" ON conversations;
DROP POLICY IF EXISTS "conversations_update_member" ON conversations;
DROP POLICY IF EXISTS "messages_select_member" ON messages;
DROP POLICY IF EXISTS "messages_insert_own" ON messages;
DROP POLICY IF EXISTS "typing_select_member" ON typing_indicators;

-- 2. Recreate is_conversation_member as SECURITY DEFINER (breaks recursion)
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = conv_id
    AND user_id = auth.uid()
    AND trashed_at IS NULL
  );
$function$;

-- 3. Revoke EXECUTE from anon (fixes "public can execute" security issue)
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM anon;

-- 4. Restore RLS policies using is_conversation_member (no recursion)

-- conversation_members
CREATE POLICY "conv_members_select" ON conversation_members FOR SELECT
  TO authenticated USING (is_conversation_member(conversation_id));

CREATE POLICY "conv_members_insert" ON conversation_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR is_conversation_member(conversation_id)
  );

-- conversations
CREATE POLICY "conversations_select" ON conversations FOR SELECT
  TO authenticated USING (is_conversation_member(id));

CREATE POLICY "conversations_update" ON conversations FOR UPDATE
  TO authenticated USING (is_conversation_member(id));

-- messages
CREATE POLICY "messages_select" ON messages FOR SELECT
  TO authenticated USING (is_conversation_member(conversation_id));

CREATE POLICY "messages_insert" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = sender_id
    AND is_conversation_member(conversation_id)
  );

-- typing_indicators
CREATE POLICY "typing_select" ON typing_indicators FOR SELECT
  TO authenticated USING (is_conversation_member(conversation_id));
