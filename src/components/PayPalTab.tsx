import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { DollarSign, Check, ArrowDownCircle, Link2, Copy, Wallet, AlertCircle, ShieldCheck, ShieldAlert, TrendingUp, TrendingDown } from 'lucide-react';
import BubbleLoader from './BubbleLoader';
import ConsentDialog from './ConsentDialog';

type Props = { userId: string };

type Transaction = {
  id: string;
  sender_paypal_email: string | null;
  recipient_paypal_email: string | null;
  amount: number;
  currency: string;
  status: string;
  note: string | null;
  created_at: string;
  capture_id: string | null;
};

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-api`;

export default function PayPalTab({ userId }: Props) {
  const [connected, setConnected] = useState(false);
  const [verified, setVerified] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [paypalEmailInput, setPaypalEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [apiConfigured, setApiConfigured] = useState(true);
  const [apiMode, setApiMode] = useState<'sandbox' | 'live'>('sandbox');
  const [paypalEmail, setPaypalEmail] = useState<string | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-webhook`;

  useEffect(() => {
    if (!userId) return;
    loadData();
    checkApiStatus();
  }, [userId]);

  async function checkApiStatus() {
    try {
      const resp = await fetch(`${API_URL}?action=status`);
      if (resp.ok) {
        const data = await resp.json();
        setApiConfigured(data.configured);
        setApiMode(data.mode);
      }
    } catch {
      setApiConfigured(false);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${API_URL}?action=connection`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setConnected(data.connected);
        setVerified(data.verified);
        setBalance(data.balance);
        setPaypalEmail(data.email);
        if (data.connected) {
          await loadTransactions(session?.access_token ?? '');
        }
      }
    } catch (err) {
      console.error('Failed to load PayPal data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactions(accessToken: string) {
    try {
      const resp = await fetch(`${API_URL}?action=transactions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setTransactions(data.transactions ?? []);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  }

  function handleConnectClick() {
    if (!paypalEmailInput.trim() || !paypalEmailInput.includes('@')) {
      setEmailError('Enter your PayPal email address');
      return;
    }
    setEmailError('');
    setShowConsent(true);
  }

  async function confirmConnect() {
    setShowConsent(false);
    setConnecting(true);
    setEmailError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${API_URL}?action=verify-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paypalEmail: paypalEmailInput.trim() }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setEmailError(data.error ?? 'Failed to connect PayPal account');
        setConnecting(false);
        return;
      }

      setConnected(true);
      setVerified(data.verified);
      setPaypalEmail(paypalEmailInput.trim());
      setPaypalEmailInput('');
      await loadData();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to connect');
    }
    setConnecting(false);
  }

  async function disconnect() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${API_URL}?action=disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
    } catch {
      // fallback: direct delete
      await supabase.from('paypal_connections').delete().eq('user_id', userId);
    }
    setConnected(false);
    setVerified(false);
    setBalance(0);
    setTransactions([]);
    setPaypalEmail(null);
  }

  function copyWebhookUrl() {
    navigator.clipboard?.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <BubbleLoader size={40} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* API not configured warning */}
      {!apiConfigured && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertCircle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-600 dark:text-amber-400 font-semibold text-[13px]">PayPal API not configured</p>
            <p className="text-amber-600/70 dark:text-amber-400/70 text-[12px] mt-0.5">
              Real payments require PayPal API credentials. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET as edge function secrets. Until then, payments are in demo mode.
            </p>
          </div>
        </div>
      )}

      {/* Mode badge */}
      {apiConfigured && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <div className={`w-1.5 h-1.5 rounded-full ${apiMode === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {apiMode === 'live' ? 'Live mode — real money' : 'Sandbox mode — test payments'}
          </span>
        </div>
      )}

      {!connected ? (
        <div className="flex flex-col items-center gap-5 py-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#0070ba] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-lg italic">P</span>
              </div>
              <div>
                <p className="text-slate-900 dark:text-white font-semibold text-[15px]">PayPal</p>
                <p className="text-slate-500 dark:text-slate-400 text-[12px]">Link your account to Bubble</p>
              </div>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed mb-4">
              Connect your PayPal email to link your account with Bubble. When someone sends you money, Bubble tells PayPal to deposit it into your account. When you send money, Bubble tells PayPal to take it out.
            </p>

            {/* Email input */}
            <div className="mb-4">
              <label className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
                Your PayPal Email
              </label>
              <input
                type="email"
                value={paypalEmailInput}
                onChange={e => { setPaypalEmailInput(e.target.value); setEmailError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleConnectClick()}
                placeholder="you@example.com"
                className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:border-sky-500/60 transition-all"
              />
              {emailError && <p className="text-red-500 text-[11px] mt-1">{emailError}</p>}
            </div>

            <button
              onClick={handleConnectClick}
              disabled={connecting}
              className="w-full py-3 bg-[#0070ba] hover:bg-[#005ea6] disabled:opacity-60 text-white font-semibold text-[15px] rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {connecting ? <BubbleLoader size={26} /> : <><DollarSign size={18} /> Link PayPal Account</>}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Connection status */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
            verified
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : 'bg-amber-500/10 border-amber-500/20'
          }`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              verified ? 'bg-emerald-500/20' : 'bg-amber-500/20'
            }`}>
              {verified
                ? <ShieldCheck size={16} className="text-emerald-500" />
                : <ShieldAlert size={16} className="text-amber-500" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${
                verified ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {verified ? 'Verified & Connected' : 'Connected (Unverified)'}
              </p>
              <p className="text-slate-900 dark:text-white text-[13px] truncate">{paypalEmail}</p>
            </div>
            <button
              onClick={disconnect}
              className="text-slate-400 hover:text-red-400 text-[12px] font-medium transition-colors"
            >
              Disconnect
            </button>
          </div>

          {/* Balance card */}
          <div className="bg-gradient-to-br from-[#0070ba] to-[#00a0d2] rounded-2xl p-5 shadow-lg shadow-sky-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={14} className="text-white/80" />
              <p className="text-white/80 text-[11px] font-semibold uppercase tracking-wider">Bubble Balance</p>
            </div>
            <p className="text-white text-3xl font-bold">
              ${balance.toFixed(2)}
            </p>
            <p className="text-white/60 text-[11px] mt-1">
              {verified ? 'Synced with your PayPal account' : 'Update pending — verify your account for full sync'}
            </p>
          </div>

          {/* How it works */}
          <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/5">
            <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">How it works</p>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <TrendingDown size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-slate-600 dark:text-slate-300 text-[12px] leading-relaxed">
                  <span className="font-medium">Sending money:</span> Bubble tells PayPal to withdraw the amount from your account and send it to the recipient.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <TrendingUp size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-slate-600 dark:text-slate-300 text-[12px] leading-relaxed">
                  <span className="font-medium">Receiving money:</span> When someone sends you money, Bubble tells PayPal to deposit it into your linked account.
                </p>
              </div>
            </div>
          </div>

          {/* Webhook URL */}
          <div>
            <label className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
              Webhook URL
            </label>
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5">
              <Link2 size={14} className="text-slate-400 flex-shrink-0" />
              <p className="flex-1 text-slate-600 dark:text-slate-300 text-[11px] truncate font-mono">{webhookUrl}</p>
              <button
                onClick={copyWebhookUrl}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex-shrink-0"
                title="Copy"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
              Add this URL to your PayPal app's webhooks to receive payment notifications.
            </p>
          </div>

          {/* Transaction history */}
          {transactions.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Transaction History
              </p>
              <div className="space-y-2">
                {transactions.map(tx => {
                  const isSender = tx.sender_paypal_email && tx.sender_paypal_email !== paypalEmail;
                  const isReceived = tx.recipient_paypal_email === paypalEmail;
                  return (
                    <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-100 dark:bg-white/5 rounded-xl">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        tx.status === 'completed'
                          ? (isReceived ? 'bg-emerald-500/10' : 'bg-red-500/10')
                          : 'bg-amber-500/10'
                      }`}>
                        {tx.status !== 'completed'
                          ? <AlertCircle size={16} className="text-amber-500" />
                          : isReceived
                            ? <ArrowDownCircle size={16} className="text-emerald-500" />
                            : <TrendingUp size={16} className="text-red-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-900 dark:text-white text-[13px] font-medium">
                          {isReceived ? '+' : '-'}${tx.amount.toFixed(2)} {tx.currency}
                          {tx.status !== 'completed' && <span className="text-amber-500 ml-1">({tx.status})</span>}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                          {isReceived
                            ? `From ${tx.sender_paypal_email ?? 'PayPal'}`
                            : `To ${tx.recipient_paypal_email ?? 'PayPal'}`
                          }
                          {' · '}{formatDate(tx.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Consent Dialog */}
      <ConsentDialog
        open={showConsent}
        title="Link PayPal to Bubble"
        serviceName="PayPal"
        description="Bubble wants to link your PayPal account using the email address you provided. This creates a two-way connection: Bubble can tell PayPal to send money from your account and receive money into your account."
        permissions={[
          'Withdraw money from your PayPal account when you send payments',
          'Deposit money into your PayPal account when you receive payments',
          'Check your PayPal email is valid and active',
          'Track your payment history within Bubble',
          'Update your Bubble balance when payments complete',
        ]}
        onAgree={confirmConnect}
        onCancel={() => setShowConsent(false)}
      />
    </div>
  );
}
