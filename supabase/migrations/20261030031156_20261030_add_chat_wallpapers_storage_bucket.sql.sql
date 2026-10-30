/*
# Add storage bucket for custom chat wallpapers

1. Storage
- Creates a `chat-wallpapers` storage bucket (public) for user-uploaded wallpaper images.
2. Security
- RLS policies on storage.objects: authenticated users can upload/read their own folder.
- Anyone can read (public bucket) so wallpapers display for all chat participants.
3. Notes
- Files are stored under `<user_id>/<conversation_id>/<timestamp>.<ext>`.
- Bucket is public so wallpaper images render in the chat background for all participants.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-wallpapers', 'chat-wallpapers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can read chat wallpapers" ON storage.objects;
CREATE POLICY "Anyone can read chat wallpapers"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'chat-wallpapers');

DROP POLICY IF EXISTS "Users can upload own chat wallpapers" ON storage.objects;
CREATE POLICY "Users can upload own chat wallpapers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-wallpapers' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update own chat wallpapers" ON storage.objects;
CREATE POLICY "Users can update own chat wallpapers"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-wallpapers' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'chat-wallpapers' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own chat wallpapers" ON storage.objects;
CREATE POLICY "Users can delete own chat wallpapers"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-wallpapers' AND (storage.foldername(name))[1] = auth.uid()::text);
