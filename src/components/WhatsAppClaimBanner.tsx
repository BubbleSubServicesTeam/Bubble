import { useEffect, useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { fetchPendingImportsForMe, claimMyImports } from '../lib/whatsappImport';

type Pending = { conversationId: string; importerName: string | null };

export default function WhatsAppClaimBanner({ onOpenChat }: { onOpenChat: (conversationId: string) => void }) {
  const { user, profile } = useAuth();
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const found = await fetchPendingImportsForMe();
      if (!cancelled) setPending(found);
    })();
    return () => { cancelled = true; };
  }, [user, profile?.phone_number]);

  if (!pending || pending.length === 0 || dismissed) return null;

  async function handleClaim() {
    setClaiming(true);
    const claimed = await claimMyImports();
    setClaiming(false);
    if (claimed > 0) {
      const first = pending?.[0];
      setPending([]);
      if (first) onOpenChat(first.conversationId);
    }
  }

  return (
    <div className="mx-2 mt-2 md:mx-3 md:mt-3 p-3 rounded-2xl border border-green-500/30 bg-green-500/[0.06] flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
        <MessageSquarePlus size={15} className="text-green-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
          {pending.length === 1 ? 'An imported chat is waiting for you' : `${pending.length} imported chats are waiting for you`}
        </p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
          {pending.length === 1
            ? `${pending[0].importerName ?? 'Someone'} imported a WhatsApp chat with your phone number. Claim it to continue the conversation here.`
            : 'Someone imported WhatsApp chats with your phone number. Claim them to continue the conversations here.'}
        </p>
        <button
          onClick={handleClaim}
          disabled={claiming}
          className="mt-2 px-4 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-white text-[12px] font-semibold transition-colors disabled:opacity-60"
        >
          {claiming ? 'Claiming…' : 'Claim chat' + (pending.length > 1 ? 's' : '')}
        </button>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
