import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { WALLPAPERS, getWallpaperThumb } from '../lib/wallpapers';
import { X, Check, Lock, Upload, Trash2 } from 'lucide-react';

type Props = {
  conversationId: string;
  isGroup: boolean;
  isCreator: boolean;
  onClose: () => void;
};

export default function WallpaperPicker({ conversationId, isGroup, isCreator, onClose }: Props) {
  const { user } = useAuth();
  const [current, setCurrent] = useState('none');
  const [saving, setSaving] = useState(false);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canChange = !isGroup || isCreator;

  useEffect(() => {
    if (!user || !conversationId) return;
    supabase
      .from('chat_wallpapers')
      .select('wallpaper')
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCurrent(data.wallpaper);
          if (data.wallpaper.startsWith('custom:')) setCustomUrl(data.wallpaper.slice(7));
        }
      });
  }, [user, conversationId]);

  async function pick(id: string) {
    if (!canChange || !user) return;
    setSaving(true);
    setCurrent(id);
    if (!id.startsWith('custom:')) setCustomUrl(null);
    await upsert(id);
    setSaving(false);
  }

  async function upsert(wallpaperId: string) {
    const { data: existing } = await supabase
      .from('chat_wallpapers')
      .select('id')
      .eq('user_id', user!.id)
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (existing) {
      await supabase.from('chat_wallpapers').update({ wallpaper: wallpaperId }).eq('id', existing.id);
    } else {
      await supabase.from('chat_wallpapers').insert({ user_id: user!.id, conversation_id: conversationId, wallpaper: wallpaperId });
    }
  }

  async function handleUpload(file: File) {
    if (!canChange || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${user.id}/${conversationId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('chat-wallpapers')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('chat-wallpapers').getPublicUrl(path);
      const url = urlData.publicUrl;
      setCustomUrl(url);
      const wallpaperId = `custom:${url}`;
      setCurrent(wallpaperId);
      await upsert(wallpaperId);
    } catch (err) {
      console.error('Wallpaper upload failed:', err);
    } finally {
      setUploading(false);
    }
  }

  async function removeCustom() {
    if (!canChange || !user) return;
    setCustomUrl(null);
    await pick('none');
  }

  const presets = WALLPAPERS.filter(w => w.id !== 'none');

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5 flex-shrink-0">
          <h2 className="text-slate-900 dark:text-white font-bold text-lg">Wallpaper</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>

        {!canChange && (
          <div className="flex items-center gap-2 mx-5 mt-4 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 text-[12px] flex-shrink-0">
            <Lock size={13} />
            Only the group creator can change the wallpaper
          </div>
        )}

        <div className="overflow-y-auto scrollbar-thin p-5 space-y-5">
          {/* Custom upload */}
          {canChange && (
            <div>
              <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Upload size={13} /> Custom
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/15 text-slate-500 hover:border-sky-400 hover:text-sky-500 transition-all text-[13px] font-medium disabled:opacity-50"
                >
                  {uploading ? (
                    <><div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload size={16} /> Upload image</>
                  )}
                </button>
                {customUrl && (
                  <button
                    onClick={removeCustom}
                    className="w-11 h-11 rounded-2xl bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition-colors flex-shrink-0"
                    title="Remove custom wallpaper"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
              />
              {customUrl && (
                <div className="mt-3 relative aspect-video rounded-2xl overflow-hidden border-2 border-sky-500 ring-2 ring-sky-500/30">
                  <img src={customUrl} alt="Custom wallpaper" className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center">
                    <Check size={14} className="text-white" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Presets */}
          <div>
            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-3">Presets</p>
            <div className="grid grid-cols-3 gap-3">
              {/* None option */}
              <button
                onClick={() => pick('none')}
                disabled={!canChange}
                className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                  current === 'none' ? 'border-sky-500 ring-2 ring-sky-500/30' : 'border-slate-200 dark:border-white/10'
                } ${!canChange ? 'opacity-50 cursor-not-allowed' : 'hover:border-sky-400'}`}
                style={{ background: '#f8fafc' }}
                title="None"
              >
                {current === 'none' && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                )}
                <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-slate-500">None</span>
              </button>

              {presets.map(wp => (
                <button
                  key={wp.id}
                  onClick={() => pick(wp.id)}
                  disabled={!canChange}
                  className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                    current === wp.id ? 'border-sky-500 ring-2 ring-sky-500/30' : 'border-slate-200 dark:border-white/10'
                  } ${!canChange ? 'opacity-50 cursor-not-allowed' : 'hover:border-sky-400 hover:scale-[1.03]'}`}
                  style={{ background: wp.thumb }}
                  title={wp.name}
                >
                  {current === wp.id && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center shadow-lg">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                  <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-slate-700 dark:text-slate-200 drop-shadow-sm">{wp.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {saving && <p className="text-slate-500 text-[11px] text-center pb-3">Saving...</p>}
      </div>
    </div>
  );
}
