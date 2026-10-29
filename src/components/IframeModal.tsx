import { useState } from 'react';
import { X, Link2, Code2, MessageSquare } from 'lucide-react';

type Props = {
  onSubmit: (url: string, title: string, message: string) => void;
  onClose: () => void;
};

export default function IframeModal({ onSubmit, onClose }: Props) {
  const [input, setInput] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'url' | 'code'>('url');

  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed) return;

    let url = trimmed;
    let autoTitle = '';

    if (mode === 'code' || trimmed.includes('<iframe')) {
      const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
      if (srcMatch) {
        url = srcMatch[1];
      }
      const titleMatch = trimmed.match(/title=["']([^"']+)["']/i);
      if (titleMatch) autoTitle = titleMatch[1];
    }

    onSubmit(url, title.trim() || autoTitle || getAutoTitle(url), message.trim());
  }

  function getAutoTitle(u: string) {
    if (u.includes('spotify.com')) return 'Spotify';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('soundcloud.com')) return 'SoundCloud';
    if (u.includes('tiktok.com')) return 'TikTok';
    if (u.includes('vimeo.com')) return 'Vimeo';
    try { return new URL(u).hostname.replace('www.', ''); } catch { return 'Embed'; }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
          <h2 className="text-slate-900 dark:text-white font-bold text-[16px]">Attach Embed</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-xl">
            <button
              onClick={() => setMode('url')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-all ${
                mode === 'url'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Link2 size={14} /> Link URL
            </button>
            <button
              onClick={() => setMode('code')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-all ${
                mode === 'code'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Code2 size={14} /> Embed Code
            </button>
          </div>

          <div>
            <label className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
              {mode === 'url' ? 'URL' : 'Paste iframe embed code'}
            </label>
            {mode === 'url' ? (
              <input
                autoFocus
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="https://open.spotify.com/track/... or YouTube URL..."
                className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:border-sky-500/60 transition-all"
              />
            ) : (
              <textarea
                autoFocus
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder='<iframe src="https://open.spotify.com/embed/playlist/..." width="100%" height="352" ...></iframe>'
                rows={4}
                className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[13px] placeholder-slate-400 focus:outline-none focus:border-sky-500/60 transition-all resize-none font-mono scrollbar-thin"
              />
            )}
          </div>

          <div>
            <label className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
              <span className="flex items-center gap-1"><MessageSquare size={11} /> Message (optional)</span>
            </label>
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Add a message with your embed..."
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:border-sky-500/60 transition-all"
            />
          </div>

          {/* Supported platforms hint */}
          <div className="flex flex-wrap gap-1.5">
            {['Spotify', 'YouTube', 'SoundCloud', 'TikTok', 'Vimeo', 'Any URL'].map(p => (
              <span key={p} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[11px] font-medium border border-slate-200 dark:border-white/10">
                {p}
              </span>
            ))}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="w-full py-3 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold text-[14px] rounded-xl transition-all"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
