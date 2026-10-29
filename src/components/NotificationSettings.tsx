import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { X, Bell, BellOff, Volume2, Check } from 'lucide-react';

type Props = {
  conversationId: string;
  onClose: () => void;
};

const ALERT_TONES = [
  { id: 'default', name: 'Default' },
  { id: 'bubble', name: 'Bubble' },
  { id: 'chime', name: 'Chime' },
  { id: 'ding', name: 'Ding' },
  { id: 'none', name: 'Silent' },
];

export default function NotificationSettings({ conversationId, onClose }: Props) {
  const { user } = useAuth();
  const [muted, setMuted] = useState(false);
  const [tone, setTone] = useState('default');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !conversationId) return;
    supabase
      .from('conversation_notification_settings')
      .select('muted, alert_tone')
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setMuted(data.muted); setTone(data.alert_tone); }
      });
  }, [user, conversationId]);

  async function save(newMuted: boolean, newTone: string) {
    if (!user) return;
    setSaving(true);
    const { data: existing } = await supabase
      .from('conversation_notification_settings')
      .select('id')
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (existing) {
      await supabase.from('conversation_notification_settings').update({ muted: newMuted, alert_tone: newTone }).eq('id', existing.id);
    } else {
      await supabase.from('conversation_notification_settings').insert({ user_id: user.id, conversation_id: conversationId, muted: newMuted, alert_tone: newTone });
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
          <h2 className="text-slate-900 dark:text-white font-bold text-lg">Notifications</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {muted ? <BellOff size={20} className="text-slate-500" /> : <Bell size={20} className="text-sky-400" />}
              <div>
                <p className="text-slate-900 dark:text-white text-sm font-medium">Mute notifications</p>
                <p className="text-slate-500 text-[11px]">No alerts or push for this chat</p>
              </div>
            </div>
            <button
              onClick={() => { const v = !muted; setMuted(v); save(v, tone); }}
              className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 ${muted ? 'bg-slate-400' : 'bg-sky-500'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${muted ? 'left-0.5' : 'left-[22px]'}`} />
            </button>
          </div>

          <div>
            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Volume2 size={13} /> Alert Tone
            </p>
            <div className="space-y-1.5">
              {ALERT_TONES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTone(t.id); save(muted, t.id); }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    tone === t.id
                      ? 'bg-sky-500/15 text-sky-500 dark:text-sky-400'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {t.name}
                  {tone === t.id && <Check size={15} />}
                </button>
              ))}
            </div>
          </div>

          {saving && <p className="text-slate-500 text-[11px] text-center">Saving...</p>}
        </div>
      </div>
    </div>
  );
}
