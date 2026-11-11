import { useEffect, useState } from 'react';
import { CheckCircle, ShieldCheck, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import KeyboardPassword from './KeyboardPassword';

type Status = 'checking' | 'available' | 'unavailable' | 'failed';

async function readFunctionError(error: unknown): Promise<string> {
  const fallback = 'Could not send the link. Please try again.';
  const context = (error as { context?: Response })?.context;
  if (!context || typeof context.json !== 'function') return fallback;
  try {
    const body = await context.json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export default function TrustedRecoveryPanel({ email }: { email: string }) {
  const [status, setStatus] = useState<Status>('checking');
  const [recipient, setRecipient] = useState('');
  const [recipientActive, setRecipientActive] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus('checking');
    supabase.functions
      .invoke('account-recovery', { body: { action: 'trusted_status', email } })
      .then(({ data, error: invokeError }) => {
        if (cancelled) return;
        if (invokeError || typeof data?.hasTrustedContacts !== 'boolean') {
          setStatus('failed');
          return;
        }
        setStatus(data.hasTrustedContacts ? 'available' : 'unavailable');
      });
    return () => { cancelled = true; };
  }, [email]);

  async function handleSend(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    if (sending) return;
    if (!recipient.trim()) {
      setError('Enter the username, email, or user ID of a trusted person.');
      return;
    }
    setError('');
    setSending(true);
    const { data, error: invokeError } = await supabase.functions.invoke('account-recovery', {
      body: {
        action: 'send_reset',
        email,
        recipient: recipient.trim(),
        redirectTo: `${window.location.origin}/#reset=true`,
      },
    });
    setSending(false);
    if (invokeError) {
      setError(await readFunctionError(invokeError));
      return;
    }
    if (!data?.ok) {
      setError('Could not send the link. Please try again.');
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center py-4">
        <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={26} className="text-green-400" />
        </div>
        <p className="text-slate-900 dark:text-white font-semibold text-[15px] mb-2">Link sent to your trusted person</p>
        <p className="text-slate-500 dark:text-slate-400 text-[13px]">They will get a message from Bubble Support Team with instructions to forward the reset link to your email.</p>
      </div>
    );
  }

  if (status === 'checking') {
    return <p className="text-slate-500 text-[13px] text-center py-4">Checking trusted people...</p>;
  }

  if (status === 'failed') {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-[13px] text-red-500">
        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
        <span>We could not check trusted people for this account. Please try again in a moment.</span>
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-[13px] text-slate-700 dark:text-slate-200">
        <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-sky-500" />
        <span>
          Add trusted people to help you recover your account if you lose it. Sign in, then open Settings and add them under Trusted people. This option only works once you have at least one trusted person.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} className="space-y-4">
      <p className="text-slate-500 dark:text-slate-400 text-[13px]">
        We will send your reset link to one of your trusted people. They will forward it to your email.
      </p>
      <KeyboardPassword
        label="Trusted person"
        value={recipient}
        onChange={setRecipient}
        placeholder="Username, email, or user ID"
        onSubmit={() => handleSend()}
        active={recipientActive}
        onActivate={() => setRecipientActive(true)}
        onDismiss={() => setRecipientActive(false)}
      />
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-[13px] text-red-500">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-xl bg-sky-500 py-3 text-[14px] font-semibold text-white shadow-sm transition-all hover:bg-sky-400 active:scale-[0.99] disabled:opacity-60"
      >
        {sending ? 'Sending...' : 'Send link to trusted person'}
      </button>
    </form>
  );
}
