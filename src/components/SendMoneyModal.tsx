import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, DollarSign, Shield, Check, AlertCircle, ExternalLink } from 'lucide-react';
import BubbleLoader from './BubbleLoader';
import ConsentDialog from './ConsentDialog';

type Props = {
  recipientId: string;
  recipientName: string;
  senderPayPalEmail: string;
  onSent: (amount: number, note: string, recipientPayPalEmail: string) => void;
  onClose: () => void;
};

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-api`;

export default function SendMoneyModal({ recipientId, recipientName, senderPayPalEmail, onSent, onClose }: Props) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [recipientPaypal, setRecipientPaypal] = useState<string | null>(null);
  const [recipientVerified, setRecipientVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConsent, setShowConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [apiConfigured, setApiConfigured] = useState(true);
  const [apiMode, setApiMode] = useState<'sandbox' | 'live'>('sandbox');

  useEffect(() => {
    supabase
      .from('paypal_connections')
      .select('paypal_email, paypal_verified')
      .eq('user_id', recipientId)
      .maybeSingle()
      .then(({ data }) => {
        setRecipientPaypal(data?.paypal_email ?? null);
        setRecipientVerified(data?.paypal_verified ?? false);
        setLoading(false);
      });
    checkApiStatus();
  }, [recipientId]);

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

  async function handleSendClick() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0 || !recipientPaypal) return;
    setError('');
    setShowConsent(true);
  }

  async function confirmSend() {
    setShowConsent(false);
    setSending(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to send money');
        setSending(false);
        return;
      }

      const origin = window.location.origin;

      // Step 1: Create PayPal order
      const createResp = await fetch(`${API_URL}?action=create-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          recipientPaypalEmail: recipientPaypal,
          note: note,
          returnUrl: `${origin}?paypal_return=success&order_id=ORDER_PLACEHOLDER`,
          cancelUrl: `${origin}?paypal_return=cancel`,
        }),
      });

      if (!createResp.ok) {
        const errData = await createResp.json().catch(() => ({}));
        setError(errData.error ?? 'Failed to create PayPal payment');
        setSending(false);
        return;
      }

      const orderData = await createResp.json();
      if (!orderData.approveUrl) {
        setError('PayPal did not return a payment link');
        setSending(false);
        return;
      }

      // Step 2: Open PayPal approval page in a popup
      const popup = window.open(orderData.approveUrl, 'paypal-checkout', 'width=500,height=700,scrollbars=yes');

      if (!popup) {
        // Popup blocked — redirect the whole window
        window.location.href = orderData.approveUrl;
        return;
      }

      // Step 3: Poll for popup closure, then capture the order
      let captured = false;
      const pollInterval = setInterval(() => {
        if (popup.closed && !captured) {
          clearInterval(pollInterval);
          captured = true;
          captureOrder(orderData.orderId, session.access_token);
        }
      }, 500);

      // Timeout after 5 minutes
      setTimeout(() => {
        if (!captured) {
          clearInterval(pollInterval);
          captured = true;
          setError('Payment timed out. Please try again.');
          setSending(false);
        }
      }, 300000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
      setSending(false);
    }
  }

  async function captureOrder(orderId: string, accessToken: string) {
    try {
      const captureResp = await fetch(`${API_URL}?action=capture-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
      });

      if (!captureResp.ok) {
        const errData = await captureResp.json().catch(() => ({}));
        setError(errData.error ?? 'Payment was not completed or was cancelled');
        setSending(false);
        return;
      }

      const result = await captureResp.json();
      if (result.success) {
        onSent(parseFloat(amount), note, recipientPaypal!);
        setSending(false);
      } else {
        setError('Payment capture failed');
        setSending(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment capture failed');
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
          <h2 className="text-slate-900 dark:text-white font-bold text-[16px]">Send Money</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="py-8 flex justify-center">
              <BubbleLoader size={32} />
            </div>
          ) : !recipientPaypal ? (
            <div className="py-6 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 flex items-center justify-center mx-auto">
                <DollarSign size={22} className="text-yellow-500" />
              </div>
              <p className="text-slate-900 dark:text-white font-semibold text-[14px]">{recipientName} hasn't linked PayPal</p>
              <p className="text-slate-500 text-[13px]">They need to link their PayPal account in Settings before you can send them money.</p>
            </div>
          ) : sending ? (
            <div className="py-8 space-y-3">
              <div className="flex justify-center">
                <BubbleLoader size={36} />
              </div>
              <p className="text-center text-slate-900 dark:text-white font-semibold text-[14px]">Processing PayPal Payment</p>
              <p className="text-center text-slate-500 dark:text-slate-400 text-[12px]">
                Complete the payment in the PayPal window. This will close automatically when done.
              </p>
            </div>
          ) : (
            <>
              {/* API warning */}
              {!apiConfigured && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-600 dark:text-amber-400 text-[11px] leading-relaxed">
                    PayPal API not configured. Payments are in demo mode. Ask the app owner to add PayPal API credentials.
                  </p>
                </div>
              )}

              {/* Mode badge */}
              {apiConfigured && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <div className={`w-1.5 h-1.5 rounded-full ${apiMode === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {apiMode === 'live' ? 'Real payment' : 'Sandbox test payment'}
                  </span>
                </div>
              )}

              {/* Recipient info */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <DollarSign size={18} className="text-emerald-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-900 dark:text-white font-semibold text-[13px]">Sending via PayPal</p>
                  <p className="text-slate-500 text-[11px] truncate">To: {recipientPaypal}</p>
                  {!recipientVerified && (
                    <p className="text-amber-500 text-[10px] mt-0.5">Recipient account not verified</p>
                  )}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                  <input
                    autoFocus
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:border-emerald-500/60 transition-all"
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Note (optional)</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="What's it for?"
                  className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:border-emerald-500/60 transition-all"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-500 text-[12px] leading-relaxed">{error}</p>
                </div>
              )}

              {/* Send button */}
              <button
                onClick={handleSendClick}
                disabled={!amount || parseFloat(amount) <= 0}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold text-[14px] rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <DollarSign size={15} />
                Send ${amount || '0.00'}
              </button>
              <p className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1">
                <Shield size={10} />
                Secured by PayPal · Real payment
              </p>
            </>
          )}
        </div>
      </div>

      {/* Consent Dialog */}
      <ConsentDialog
        open={showConsent}
        title="Send Money via PayPal"
        serviceName="PayPal"
        description={`You are about to send $${amount || '0.00'} to ${recipientName} via PayPal. Bubble will tell PayPal to withdraw this amount from your account and deposit it into their linked PayPal account.`}
        permissions={[
          `Withdraw $${amount || '0.00'} from your PayPal account`,
          'Deposit the money into the recipient\'s PayPal account',
          'Share your email with the recipient for this transaction',
          'Record this transaction in your Bubble payment history',
        ]}
        onAgree={confirmSend}
        onCancel={() => setShowConsent(false)}
      />
    </div>
  );
}
