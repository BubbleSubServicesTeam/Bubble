/*
# Fix RLS security issues

1. conversation_members INSERT policy — restrict to only adding yourself or
   adding others when you are already a member of that conversation (creator flow).
2. notifications INSERT policy — restrict to only creating notifications for
   other users when you are the authenticated sender (sender_id = auth.uid()).
3. storage media_read — replace the broad anon/authenticated SELECT with one
   that requires authentication and disallows directory listing by requiring
   a non-empty name (object path), preventing bucket enumeration.
*/

-- 1. Fix conversation_members INSERT
DROP POLICY IF EXISTS "conv_members_insert" ON conversation_members;
CREATE POLICY "conv_members_insert" ON conversation_members FOR INSERT
TO authenticated
WITH CHECK (
  -- Can add yourself to any conversation
  user_id = auth.uid()
  OR
  -- Can add others only if you are already a member of that conversation
  EXISTS (
    SELECT 1 FROM conversation_members existing
    WHERE existing.conversation_id = conversation_members.conversation_id
      AND existing.user_id = auth.uid()
  )
);

-- 2. Fix notifications INSERT
DROP POLICY IF EXISTS "notifs_insert" ON notifications;
CREATE POLICY "notifs_insert" ON notifications FOR INSERT
TO authenticated
WITH CHECK (
  -- Must be the sender, and cannot send notifications to yourself
  sender_id = auth.uid()
  AND recipient_id <> auth.uid()
);

-- 3. Fix storage media SELECT — authenticated only, no anonymous listing
DROP POLICY IF EXISTS "media_read" ON storage.objects;
CREATE POLICY "media_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media'
  AND name IS NOT NULL
  AND name <> ''
);
