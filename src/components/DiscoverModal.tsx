import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getDailyItem } from '../lib/dailyContent';
import { X, Quote, Lightbulb, History, RefreshCw, FileText, ImageIcon, Puzzle } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type Memory = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_name: string | null;
  message_type: string;
  content: string | null;
  media_url: string | null;
  gif_url: string | null;
  file_name: string | null;
  created_at: string;
};

type Props = { onClose: () => void };

const KIND_META = {
  quote: { label: 'Quote of the day', icon: Quote },
  riddle: { label: 'Riddle of the day', icon: Puzzle },
  tip: { label: 'Bubble tip', icon: Lightbulb },
} as const;

function yearsAgoLabel(iso: string) {
  const years = new Date().getFullYear() - new Date(iso).getFullYear();
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

function isMemory(value: unknown): value is Memory {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.created_at === 'string' && typeof v.message_type === 'string';
}

export default function DiscoverModal({ onClose }: Props) {
  const [offset, setOffset] = useState(0);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const today = new Date();
  const item = getDailyItem(today, offset);
  const KindIcon = KIND_META[item.kind].icon;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const { data, error: rpcError } = await supabase.rpc('get_on_this_day_memories', {
        p_month: today.getMonth() + 1,
        p_day: today.getDate(),
      });
      if (cancelled) return;
      if (rpcError || !Array.isArray(data)) {
        setError('Could not load memories. Try again in a moment.');
        setMemories([]);
      } else {
        setMemories(data.filter(isMemory));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function renderMemoryBody(m: Memory) {
    if (m.message_type === 'image' && m.media_url) {
      return <img src={m.media_url} alt="Shared photo" className="w-full max-h-64 object-cover rounded-xl" />;
    }
    if (m.message_type === 'gif' && (m.gif_url || m.media_url)) {
      return <img src={m.gif_url ?? m.media_url ?? ''} alt="Shared GIF" className="w-full max-h-64 object-cover rounded-xl" />;
    }
    if (m.message_type === 'file') {
      return (
        <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <FileText size={16} className="text-sky-500" />
          {m.file_name ?? 'Shared a file'}
        </p>
      );
    }
    if (m.message_type === 'voicemail') {
      return <p className="text-sm text-slate-600 dark:text-slate-300">Shared a voicemail</p>;
    }
    return (
      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 line-clamp-4 whitespace-pre-wrap break-words">
        {m.content ?? ''}
      </p>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Discover</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{today.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          <section className="rounded-2xl p-5 bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/85">
                <KindIcon size={13} />
                {KIND_META[item.kind].label}
              </span>
              <button
                onClick={() => setOffset(o => o + 1)}
                className="flex items-center gap-1 text-[11px] font-medium text-white/85 hover:text-white transition-colors"
              >
                <RefreshCw size={12} />
                Another
              </button>
            </div>
            <p className="text-[17px] leading-snug font-medium">{item.text}</p>
            {item.attribution && <p className="mt-3 text-xs text-white/80">{item.attribution}</p>}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <History size={16} className="text-sky-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">On this day</h3>
            </div>

            {loading && (
              <div className="flex justify-center py-8"><BubbleLoader /></div>
            )}

            {!loading && error && (
              <p className="text-sm text-red-500 dark:text-red-400 py-4">{error}</p>
            )}

            {!loading && !error && memories.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                Nothing from this day in past years yet. Memories from your chats will appear here as your history grows.
              </p>
            )}

            {!loading && !error && memories.length > 0 && (
              <ul className="space-y-3">
                {memories.map(m => (
                  <li key={m.id} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{m.sender_name ?? 'Someone'}</span>
                      <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 flex-shrink-0">
                        {m.message_type === 'image' && <ImageIcon size={12} />}
                        {yearsAgoLabel(m.created_at)}
                      </span>
                    </div>
                    {renderMemoryBody(m)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
