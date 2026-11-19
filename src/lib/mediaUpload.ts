import { supabase } from './supabase';

export async function uploadMedia(
  userId: string,
  folder: string,
  file: Blob,
  meta: { file_name: string; file_mime: string },
): Promise<{ media_url: string; file_name: string; file_mime: string; file_size: number }> {
  const path = `${folder}/${userId}/${Date.now()}-${crypto.randomUUID()}-${meta.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage
    .from('media')
    .upload(path, file, { contentType: meta.file_mime || 'application/octet-stream', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return { media_url: data.publicUrl, file_name: meta.file_name, file_mime: meta.file_mime, file_size: file.size };
}
