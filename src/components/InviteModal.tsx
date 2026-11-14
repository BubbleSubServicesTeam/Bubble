import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { ROUTES, absoluteUrl } from '../lib/routes';
import { X, QrCode, Link2, Mail, Copy, Check, RefreshCw, Loader2 } from 'lucide-react';

type Props = {
  conversationId: string;
  conversationName: string;
  isOwner: boolean;
  ownershipMode: 'single' | 'dual' | 'everyone';
};

export default function InviteModal({ conversationId, conversationName, isOwner, ownershipMode }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const generateQR = useCallback(async (tok: string) => {
    try {
      const url = absoluteUrl(ROUTES.join(tok));
      const dataUrl = await QRCode.toDataURL(url, {
        width: 240,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      if (mountedRef.current) setQrDataUrl(dataUrl);
    } catch {
      if (mountedRef.current) setQrDataUrl(null);
    }
  }, []);

  const createInvite = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('create_conversation_invite', {
        p_conversation_id: conversationId,
      });
      if (rpcError || typeof data !== 'string') {
        setError('Could not create invite link.');
        return;
      }
      if (!mountedRef.current) return;
      setToken(data);
      await generateQR(data);
    } catch {
      setError('Something went wrong.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [conversationId, generateQR]);

  const revokeInvite = useCallback(async () => {
    if (!token) return;
    setRevoking(true);
    try {
      await supabase
        .from('conversation_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token', token);
      if (!mountedRef.current) return;
      setToken(null);
      setQrDataUrl(null);
      setCopied(false);
    } finally {
      if (mountedRef.current) setRevoking(false);
    }
  }, [token]);

  const inviteUrl = token ? absoluteUrl(ROUTES.join(token)) : '';

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mailtoUrl = inviteUrl
    ? `mailto:?subject=${encodeURIComponent(`Join ${conversationName} on Bubble`)}&body=${encodeURIComponent(`You're invited to join ${conversationName} on Bubble. Click this link to join: ${inviteUrl}`)}`
    : '';

  // Only owners can generate invites unless mode is "everyone"
  const canGenerate = isOwner || ownershipMode === 'everyone';

  return (
    <div className="border-t border-slate-200 dark:border-white/5 px-6 py-5">
      <div className="flex items-center gap-2 mb-1">
        <QrCode size={16} className="text-sky-400" />
        <h3 className="text-slate-900 dark:text-white font-semibold text-[15px]">Invite people</h3>
      </div>
      <p className="text-slate-500 text-[12px] mb-4 leading-relaxed">
        Generate a QR code or invite link. When someone scans it or clicks the link, they join this chat. If it's a 2-way chat, it becomes a group chat automatically.
      </p>

      {!token ? (
        <button
          onClick={createInvite}
          disabled={loading || !canGenerate}
          className="w-full flex items-center justify-center gap-2 py-3 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-600 dark:text-sky-400 font-medium text-[14px] rounded-xl transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
          {loading ? 'Generating...' : canGenerate ? 'Generate invite link & QR code' : 'Only owners can generate invites'}
        </button>
      ) : (
        <div className="space-y-4">
          {/* QR Code */}
          <div className="flex flex-col items-center gap-3 bg-white rounded-2xl p-4 border border-slate-200 dark:border-white/10">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Invite QR code" className="w-48 h-48" />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-slate-400" />
              </div>
            )}
            <p className="text-[11px] text-slate-500 text-center">Scan with any device to join</p>
          </div>

          {/* Invite link + copy */}
          <div className="space-y-2">
            <label className="text-[12px] text-slate-500 font-medium">Invite link</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5">
                <p className="text-[12px] text-slate-600 dark:text-slate-300 truncate">{inviteUrl}</p>
              </div>
              <button
                onClick={copyLink}
                className="w-10 h-10 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-500 flex items-center justify-center transition-all flex-shrink-0"
                title="Copy link"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={mailtoUrl}
              className="flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-medium text-[13px] rounded-xl transition-all border border-slate-200 dark:border-white/10"
            >
              <Mail size={15} />
              Share via email
            </a>
            <button
              onClick={revokeInvite}
              disabled={revoking}
              className="flex items-center justify-center gap-2 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 dark:text-red-400 font-medium text-[13px] rounded-xl transition-all disabled:opacity-50"
            >
              {revoking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Revoke link
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-[12px] mt-2 text-center">{error}</p>}
    </div>
  );
}
