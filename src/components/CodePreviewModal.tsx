import { useState } from 'react';
import { X, Code2, Eye, Send, Maximize2, Minimize2 } from 'lucide-react';

type Props = {
  code: string;
  language: string;
  onSubmit: (code: string, language: string, message: string) => void;
  onClose: () => void;
};

export default function CodePreviewModal({ code, language, onSubmit, onClose }: Props) {
  const [view, setView] = useState<'preview' | 'raw'>('preview');
  const [message, setMessage] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  function detectLanguage(code: string): string {
    const trimmed = code.trim();
    if (trimmed.startsWith('<iframe')) return 'iframe';
    if (trimmed.startsWith('<') && trimmed.includes('>')) return 'html';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { JSON.parse(trimmed); return 'json'; } catch {}
    }
    if (/function\s|const\s|let\s|var\s|=>|console\.log/.test(trimmed)) return 'javascript';
    if (/def\s|print\s|import\s/.test(trimmed)) return 'python';
    if (/#include|int\smain|std::/.test(trimmed)) return 'cpp';
    if (/public\sclass|System\.out|import\sjava/.test(trimmed)) return 'java';
    if (/SELECT\s|INSERT\s|UPDATE\s|DELETE\s|CREATE\s/i.test(trimmed)) return 'sql';
    if (/^\s*\.[a-z]/m.test(trimmed) || /display\s*:|margin\s*:|padding\s*:/.test(trimmed)) return 'css';
    return 'text';
  }

  const lang = language || detectLanguage(code);
  const canPreview = lang === 'html' || lang === 'iframe';
  const isVisual = canPreview;

  function handleSubmit() {
    onSubmit(code, lang, message.trim());
  }

  const containerClass = fullscreen
    ? 'fixed inset-0 z-[200] bg-slate-950 flex flex-col'
    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200';

  const overlayClass = fullscreen
    ? 'fixed inset-0 z-[200]'
    : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';

  return (
    <div className={overlayClass} onClick={fullscreen ? undefined : onClose}>
      <div className={containerClass} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5 ${fullscreen ? 'bg-slate-900' : ''}`}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center">
              <Code2 size={15} className="text-sky-500" />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[15px]">Code Snippet</h2>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">{lang}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  isVisual
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400'
                }`}>
                  {isVisual ? 'Visual + Code' : 'Code only'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFullscreen(f => !f)}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* View toggle — always show both if previewable */}
        <div className={`flex gap-1 p-1 mx-5 mt-4 bg-slate-100 dark:bg-white/5 rounded-xl ${fullscreen ? 'max-w-2xl mx-auto' : ''}`}>
          {canPreview && (
            <button
              onClick={() => setView('preview')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-all ${
                view === 'preview' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Eye size={14} /> Visual Preview
            </button>
          )}
          <button
            onClick={() => setView('raw')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-all ${
              view === 'raw' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Code2 size={14} /> Source Code
          </button>
        </div>

        {/* Content area */}
        <div className={`px-5 py-4 flex-1 ${fullscreen ? 'overflow-hidden' : ''}`}>
          <div className="bg-slate-950 dark:bg-black/40 rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden h-full" style={fullscreen ? { height: '100%' } : { maxHeight: '300px' }}>
            {view === 'preview' && canPreview ? (
              <iframe
                srcDoc={code}
                title="HTML Preview"
                sandbox="allow-scripts"
                className="w-full bg-white"
                style={fullscreen ? { height: '100%', border: 'none' } : { height: '280px', border: 'none' }}
              />
            ) : (
              <div className="overflow-auto scrollbar-thin h-full" style={{ maxHeight: fullscreen ? '100%' : '300px' }}>
                <pre className="p-4 text-[13px] leading-relaxed font-mono text-sky-200 whitespace-pre-wrap break-words">
                  <code>{code}</code>
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Optional message + send */}
        <div className={`px-5 pb-5 space-y-3 ${fullscreen ? 'bg-slate-900 border-t border-white/5' : ''}`}>
          <input
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Add a note at the top (optional)..."
            className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:border-sky-500/60 transition-all"
          />
          <button
            onClick={handleSubmit}
            className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[14px] rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Send size={15} /> Send Code
          </button>
        </div>
      </div>
    </div>
  );
}
