import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

type Props = {
  userId: string;
  children: ReactNode;
};

type TabClaim = {
  id: string;
  touchedAt: number;
};

const CLAIM_TTL = 8000;

function claimKey(userId: string): string {
  return `bubble-active-tab:${userId}`;
}

function readClaim(userId: string): TabClaim | null {
  try {
    const raw = localStorage.getItem(claimKey(userId));
    if (!raw) return null;
    const claim = JSON.parse(raw) as TabClaim;
    return typeof claim.id === 'string' && typeof claim.touchedAt === 'number' ? claim : null;
  } catch {
    return null;
  }
}

export default function ActiveTabGuard({ userId, children }: Props) {
  const [tabId] = useState(() => crypto.randomUUID());
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const claimTab = useCallback(() => {
    const claim: TabClaim = { id: tabId, touchedAt: Date.now() };
    localStorage.setItem(claimKey(userId), JSON.stringify(claim));
    setActiveTabId(tabId);
    channelRef.current?.postMessage(claim);
  }, [tabId, userId]);

  useEffect(() => {
    const channel = new BroadcastChannel(`bubble-active-tab:${userId}`);
    channelRef.current = channel;
    const updateFromClaim = (claim: TabClaim) => {
      if (claim && claim.touchedAt + CLAIM_TTL >= Date.now()) setActiveTabId(claim.id);
    };
    const onMessage = (event: MessageEvent<TabClaim>) => updateFromClaim(event.data);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== claimKey(userId)) return;
      const claim = readClaim(userId);
      if (claim) updateFromClaim(claim);
    };
    const onFocus = () => claimTab();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') claimTab();
    };

    channel.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    claimTab();

    const heartbeat = window.setInterval(() => {
      const claim = readClaim(userId);
      if (document.visibilityState === 'visible' && claim?.id === tabId) claimTab();
      else if (claim) updateFromClaim(claim);
      else if (document.visibilityState === 'visible') claimTab();
    }, 2000);

    return () => {
      window.clearInterval(heartbeat);
      channel.removeEventListener('message', onMessage);
      channel.close();
      channelRef.current = null;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      const claim = readClaim(userId);
      if (claim?.id === tabId) localStorage.removeItem(claimKey(userId));
    };
  }, [claimTab, tabId, userId]);

  const isLocked = activeTabId !== null && activeTabId !== tabId;

  return (
    <>
      {children}
      {isLocked && (
        <div
          className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/80 p-6 text-center backdrop-blur-xl"
          onPointerDown={claimTab}
        >
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-400">
              <ShieldCheck size={28} />
            </div>
            <h2 className="text-xl font-semibold text-white">Security lock active</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Bubble is open in another tab. This tab is paused to protect your encrypted session.
            </p>
            <p className="mt-5 text-xs font-medium text-sky-300">Tap to make this the active tab</p>
          </div>
        </div>
      )}
    </>
  );
}
