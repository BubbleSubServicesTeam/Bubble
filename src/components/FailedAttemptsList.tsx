import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { KeyRound, Lock, ShieldAlert } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type Attempt = {
  id: string;
  attempt_type: string;
  email_attempted: string | null;
  value_typed: string | null;
  created_at: string;
};

export default function FailedAttemptsList() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('failed_login_attempts')
        .select('id, attempt_type, email_attempted, value_typed, created_at')
        .order('created_at', { ascending: false })
        .limit(25);
      setAttempts(data ?? []);
      setLoading(false);
    })();
  }, []);

  function formatWhen(iso: string) {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <ShieldAlert size={16} className="text-red-500" />
        </div>
        <div className="flex-1">
          <p className="text-slate-900 dark:text-white font-semibold text-[14px] mb-1">Failed Unlock Attempts</p>
          <p className="text-slate-500 dark:text-slate-500 text-[13px] leading-relaxed">
            Every wrong PIN or password tried on this account — including what was typed.
          </p>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-4"><BubbleLoader size={24} /></div>
      ) : attempts.length === 0 ? (
        <p className="text-slate-400 text-[13px] text-center py-2">No failed attempts recorded. You'll see entries here if someone enters a wrong PIN or password.</p>
      ) : (
        <div className="space-y-2">
          {attempts.map(a => (
            <div key={a.id} className="flex items-center gap-3 bg-white dark:bg-white/[0.04] rounded-xl p-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.attempt_type === 'pin' ? 'bg-amber-500/10' : 'bg-red-500/10'}`}>
                {a.attempt_type === 'pin'
                  ? <KeyRound size={15} className="text-amber-500" />
                  : <Lock size={15} className="text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 dark:text-white text-[13px] font-medium">
                  {a.attempt_type === 'pin' ? 'Wrong PIN' : 'Wrong password'}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                  {a.email_attempted ?? 'No email'}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-slate-900 dark:text-white text-[13px] font-mono font-medium break-all">
                  {a.value_typed ? (a.attempt_type === 'pin' ? a.value_typed : `“${a.value_typed}”`) : '—'}
                </p>
                <p className="text-slate-400 dark:text-slate-500 text-[11px]">{formatWhen(a.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
