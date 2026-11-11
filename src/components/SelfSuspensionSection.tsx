import { useState } from 'react';
import { Ban, Lock, KeyRound, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth, hashPin } from '../lib/auth';

export default function SelfSuspensionSection() {
  const { profile, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'idle' | 'confirm' | 'unlock-pin' | 'unlock-password'>('idle');
  const [secret, setSecret] = useState('');

  if (!profile || !user) return null;

  const suspended = !!profile.is_suspended;
  const selfSuspended = !!profile.self_suspended;
  const hasPin = !!profile.pin_hash;

  function reset() {
    setMode('idle');
    setSecret('');
    setError('');
  }

  async function suspendSelf() {
    setBusy(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('set_own_suspension', { p_suspended: true });
    setBusy(false);
    if (rpcError) { setError('Could not suspend your account. Please try again.'); return; }
    reset();
  }

  async function unsuspendSelf() {
    setBusy(true);
    setError('');
    const args = mode === 'unlock-pin'
      ? { p_suspended: false, p_pin_hash: await hashPin(secret) }
      : { p_suspended: false, p_password: secret };
    const { error: rpcError } = await supabase.rpc('set_own_suspension', args);
    setBusy(false);
    if (rpcError) {
      setError(mode === 'unlock-pin' ? 'That PIN is not correct.' : 'That password is not correct.');
      return;
    }
    reset();
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert size={16} className="text-amber-600 dark:text-amber-400" />
        <h3 className="text-slate-900 dark:text-white font-semibold text-[15px]">Account suspension</h3>
      </div>

      {!suspended && (
        <>
          <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed">
            Suspending your account stops you from sending messages, starting chats, and using admin tools until you unsuspend it. Your chats stay visible.
          </p>
          {mode === 'confirm' ? (
            <div className="space-y-2">
              <p className="text-slate-700 dark:text-slate-300 text-[13px]">Suspend your account now?</p>
              <div className="flex gap-2">
                <button onClick={suspendSelf} disabled={busy}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-semibold disabled:opacity-50 transition-colors">
                  {busy ? 'Suspending...' : 'Yes, suspend'}
                </button>
                <button onClick={reset} disabled={busy}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 text-[13px] font-semibold hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setMode('confirm')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-semibold transition-colors">
              <Ban size={14} />
              Suspend my account
            </button>
          )}
        </>
      )}

      {suspended && !selfSuspended && (
        <p className="text-slate-600 dark:text-slate-300 text-[13px] leading-relaxed">
          Your account was suspended by an administrator. Only an administrator can lift this suspension.
        </p>
      )}

      {suspended && selfSuspended && (
        <>
          <p className="text-slate-600 dark:text-slate-300 text-[13px] leading-relaxed">
            You suspended your account. Unsuspend it to send messages and use admin tools again.
          </p>
          {mode === 'idle' && (
            <div className="flex flex-wrap gap-2">
              {hasPin && (
                <button onClick={() => setMode('unlock-pin')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-[13px] font-semibold transition-colors">
                  <KeyRound size={14} />
                  Unsuspend with PIN
                </button>
              )}
              <button onClick={() => setMode('unlock-password')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 text-[13px] font-semibold hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors">
                <Lock size={14} />
                Unsuspend with password
              </button>
            </div>
          )}
          {(mode === 'unlock-pin' || mode === 'unlock-password') && (
            <form onSubmit={(e) => { e.preventDefault(); if (secret) unsuspendSelf(); }} className="space-y-2">
              <input
                type="password"
                inputMode={mode === 'unlock-pin' ? 'numeric' : 'text'}
                autoComplete={mode === 'unlock-pin' ? 'off' : 'current-password'}
                value={secret}
                onChange={(e) => setSecret(mode === 'unlock-pin' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                placeholder={mode === 'unlock-pin' ? 'Enter your PIN' : 'Enter your password'}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                autoFocus
              />
              {error && <p role="alert" className="text-red-600 dark:text-red-400 text-[13px]">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy || !secret}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-[13px] font-semibold disabled:opacity-50 transition-colors">
                  {busy ? 'Checking...' : 'Unsuspend'}
                </button>
                <button type="button" onClick={reset} disabled={busy}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 text-[13px] font-semibold hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {!suspended && error && <p role="alert" className="text-red-600 dark:text-red-400 text-[13px]">{error}</p>}
    </div>
  );
}
