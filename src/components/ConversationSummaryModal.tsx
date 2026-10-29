import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { X, Sparkles, Calendar, Clock, ChevronDown, Copy, Check, FileText } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type Props = {
  conversationId: string;
  conversationName: string;
  lastReadAt?: string | null;
  onClose: () => void;
};

type RangeKey = 'unread' | 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

const RANGE_OPTIONS: { key: RangeKey; label: string; icon: typeof Clock }[] = [
  { key: 'unread', label: "What you missed", icon: Clock },
  { key: 'today', label: 'Today', icon: Clock },
  { key: 'week', label: 'Past week', icon: Calendar },
  { key: 'month', label: 'This month', icon: Calendar },
  { key: 'year', label: 'Past year', icon: Calendar },
  { key: 'all', label: 'Everything', icon: FileText },
  { key: 'custom', label: 'Custom dates', icon: Calendar },
];

function getRangeDates(key: RangeKey, lastReadAt?: string | null, customStart?: string, customEnd?: string): { start_date?: string; end_date?: string } {
  const now = new Date();
  switch (key) {
    case 'unread': {
      if (!lastReadAt) return {};
      return { start_date: lastReadAt };
    }
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start_date: start.toISOString() };
    }
    case 'week': {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start_date: start.toISOString() };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start_date: start.toISOString() };
    }
    case 'year': {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      return { start_date: start.toISOString() };
    }
    case 'custom': {
      const result: { start_date?: string; end_date?: string } = {};
      if (customStart) result.start_date = new Date(customStart + 'T00:00:00').toISOString();
      if (customEnd) result.end_date = new Date(customEnd + 'T23:59:59').toISOString();
      return result;
    }
    case 'all':
    default:
      return {};
  }
}

export default function ConversationSummaryModal({ conversationId, conversationName, lastReadAt, onClose }: Props) {
  const { user } = useAuth();
  const [selectedRange, setSelectedRange] = useState<RangeKey>(lastReadAt ? 'unread' : 'week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function generateSummary() {
    if (!user) return;
    setLoading(true);
    setError('');
    setSummary(null);
    setMessageCount(null);

    try {
      const { start_date, end_date } = getRangeDates(selectedRange, lastReadAt, customStart, customEnd);
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ conversation_id: conversationId, start_date, end_date }),
      });

      const result = await resp.json();
      if (!resp.ok) {
        setError(result.error ?? 'Failed to generate summary');
        setLoading(false);
        return;
      }
      setSummary(result.summary);
      setMessageCount(result.messageCount);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
    setLoading(false);
  }

  function copySummary() {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setSummary(null);
    setError('');
    setMessageCount(null);
    onClose();
  }

  const showCustom = selectedRange === 'custom';
  const hasUnread = !!lastReadAt;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-[16px] leading-tight">Summary</h2>
              <p className="text-slate-500 dark:text-slate-400 text-[12px] truncate">{conversationName}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {!summary && !loading && (
            <div className="p-6 space-y-5">
              {/* Range selection */}
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium mb-3">
                  Choose what to summarize
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {RANGE_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const isActive = selectedRange === opt.key;
                    const isDisabled = opt.key === 'unread' && !hasUnread;
                    if (isDisabled) return null;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setSelectedRange(opt.key)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-medium border-2 transition-all ${
                          isActive
                            ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                            : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/15'
                        }`}
                      >
                        <Icon size={14} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom date pickers */}
              {showCustom && (
                <div className="space-y-3">
                  <div>
                    <label className="text-slate-500 dark:text-slate-400 text-[12px] font-medium block mb-1.5">Start date</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500/40 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 dark:text-slate-400 text-[12px] font-medium block mb-1.5">End date (optional)</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-[14px] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500/40 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={generateSummary}
                disabled={showCustom && !customStart}
                className="w-full py-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-[14px] rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <Sparkles size={16} />
                Generate Summary
              </button>

              {error && (
                <p className="text-red-400 text-[13px] text-center">{error}</p>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <BubbleLoader size={40} />
              <p className="text-slate-500 dark:text-slate-400 text-[14px]">Reading through messages...</p>
              <p className="text-slate-400 dark:text-slate-500 text-[12px]">This may take a moment for long conversations</p>
            </div>
          )}

          {/* Summary result */}
          {summary && !loading && (
            <div className="p-6 space-y-4">
              {messageCount !== null && (
                <div className="flex items-center gap-2 text-[12px] text-slate-400 dark:text-slate-500">
                  <FileText size={13} />
                  <span>Summarized {messageCount} message{messageCount !== 1 ? 's' : ''}</span>
                </div>
              )}
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-5">
                <div className="flex items-start gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles size={14} className="text-sky-500" />
                  </div>
                  <p className="text-slate-900 dark:text-white text-[14px] leading-relaxed whitespace-pre-wrap">
                    {summary}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copySummary}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.10] text-slate-600 dark:text-slate-300 font-medium text-[14px] rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
                </button>
                <button
                  onClick={() => { setSummary(null); setMessageCount(null); }}
                  className="flex-1 py-2.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 font-medium text-[14px] rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <ChevronDown size={15} className="rotate-90" />
                  New summary
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
