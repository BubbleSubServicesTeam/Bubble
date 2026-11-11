/*
# Allow owners to replace their own media files

1. Problem
- Profile photos and other uploads are sent with "replace if exists" turned on, so saving a new photo over an existing one needs UPDATE permission on the file.
- The media bucket only had SELECT, INSERT and DELETE policies, so every replace was rejected with a policy violation error.

2. Change
- Adds an UPDATE policy on the media bucket for signed-in users.

3. Security
- Users can only update objects whose path has their own user ID in the second folder segment (uploads/{userId}/... or avatars/{userId}/...), matching the existing upload and delete rules.
- Both the existing and the new file location must belong to the user (USING and WITH CHECK).
*/

DROP POLICY IF EXISTS "media_update_own" ON storage.objects;

CREATE POLICY "media_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'media'
  AND (auth.uid())::text = (storage.foldername(name))[2]
)
WITH CHECK (
  bucket_id = 'media'
  AND (auth.uid())::text = (storage.foldername(name))[2]
);
