/*
# Add storage RLS policies for media bucket

Allows authenticated users to upload and read media files.
*/

DROP POLICY IF EXISTS "media_upload" ON storage.objects;
CREATE POLICY "media_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "media_read" ON storage.objects;
CREATE POLICY "media_read"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media_delete_own" ON storage.objects;
CREATE POLICY "media_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[2]);
