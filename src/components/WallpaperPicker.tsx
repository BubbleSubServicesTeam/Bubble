import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { WALLPAPERS, getWallpaperCss } from '../lib/wallpapers';
import { X, Check, Lock } from 'lucide-react';

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

  const canChange = !isGroup || isCreator;

  useEffect(() => {
    if (!user || !conversationId) return;
    supabase
      .from('chat_wallpapers')
      .select('wallpaper')
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .maybeSingle()
      .then(({ data }) => { if (data) setCurrent(data.wallpaper); });
  }, [user, conversationId]);

  async function pick(id: string) {
    if (!canChange || !user) return;
    setSaving(true);
    setCurrent(id);
    const { data: existing } = await supabase
      .from('chat_wallpapers')
      .select('id')
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (existing) {
      await supabase.from('chat_wallpapers').update({ wallpaper: id }).eq('id', existing.id);
    } else {
      await supabase.from('chat_wallpapers').insert({ user_id: user.id, conversation_id: conversationId, wallpaper: id });
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
          <h2 className="text-slate-900 dark:text-white font-bold text-lg">Wallpaper</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>

        {!canChange && (
          <div className="flex items-center gap-2 mx-5 mt-4 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 text-[12px]">
            <Lock size={13} />
            Only the group creator can change the wallpaper
          </div>
        )}

        <div className="p-5 grid grid-cols-3 gap-3">
          {WALLPAPERS.map(wp => (
            <button
              key={wp.id}
              onClick={() => pick(wp.id)}
              disabled={!canChange}
              className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                current === wp.id ? 'border-sky-500 ring-2 ring-sky-500/30' : 'border-slate-200 dark:border-white/10'
              } ${!canChange ? 'opacity-50 cursor-not-allowed' : 'hover:border-sky-400'}`}
              style={{ background: wp.css || (window.matchMedia('(prefers-color-scheme: dark)').matches ? '#0f172a' : '#f8fafc') }}
              title={wp.name}
            >
              {current === wp.id && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}
              <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-slate-600 dark:text-slate-300">{wp.name}</span>
            </button>
          ))}
        </div>

        {saving && <p className="text-slate-500 text-[11px] text-center pb-4">Saving...</p>}
      </div>
    </div>
  );
}
