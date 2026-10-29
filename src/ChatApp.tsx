import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './lib/auth';
import { useTheme, getLogoUrl } from './lib/theme';
import { useAppLang } from './lib/i18n';
import { supabase, Conversation, Message, Profile } from './lib/supabase';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import GifStudio from './components/GifStudio';
import NewChatModal from './components/NewChatModal';
import SettingsModal from './components/SettingsModal';
import PeopleDrawer from './components/PeopleDrawer';
import FantasyFootballModal from './components/FantasyFootballModal';
import { MessageCircle, StickyNote, ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function ChatApp() {
  const { t } = useAppLang();
  const { user, profile } = useAuth();
  const { theme, resolvedTheme } = useTheme();
  const [showTrash, setShowTrash] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (user) {
      try {
        const cached = localStorage.getItem(`bubble-convos-${user.id}`);
        if (cached) return JSON.parse(cached) as Conversation[];
      } catch { /* ignore */ }
    }
    return [];
  });
  const [convLoading, setConvLoading] = useState(() => {
    if (user) {
      try {
        return !localStorage.getItem(`bubble-convos-${user.id}`);
      } catch { return true; }
    }
    return true;
  });
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showGifStudio, setShowGifStudio] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPeopleDrawer, setShowPeopleDrawer] = useState(false);
  const [showFantasyLeagues, setShowFantasyLeagues] = useState(false);
  const [showFantasyManager, setShowFantasyManager] = useState(false);
  const [selfChatId, setSelfChatId] = useState<string | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const loadInProgress = useRef(false);

  // Mobile swipe arrow visibility
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // Hold gesture


  // Swipe tracking
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    loadAllProfiles();
    // Delay self-chat check so it doesn't compete with conversation loading
    const t = setTimeout(() => ensureSelfChat(), 2000);
    return () => clearTimeout(t);
  }, [user]);

  async function loadAllProfiles() {
    if (!user) return;
    const cacheKey = `bubble-profiles-${user.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) setAllProfiles(JSON.parse(cached) as Profile[]);
    } catch { /* ignore */ }

    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, first_name, last_name, avatar_url, status, status_message, last_seen, created_at')
        .neq('user_id', user.id)
        .order('last_seen', { ascending: false, nullsFirst: false })
        .limit(100);

      if (data) {
        const profiles = data as Profile[];
        setAllProfiles(profiles);
        try { localStorage.setItem(cacheKey, JSON.stringify(profiles)); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('[loadAllProfiles] Failed:', err);
    }
  }

  const ensureSelfChatRef = useRef(false);

  async function ensureSelfChat() {
    if (!user || ensureSelfChatRef.current) return;
    ensureSelfChatRef.current = true;

    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('is_self_chat', true)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        setSelfChatId(existing[0].id);
        return;
      }

      const { data, error } = await supabase.rpc('create_conversation', {
        p_other_user_ids: [],
        p_is_group: false,
        p_name: null,
      });

      if (!error && data) {
        let rpcData = data as any;
        if (typeof rpcData === 'string') {
          try { rpcData = JSON.parse(rpcData); } catch { /* ignore */ }
        }
        const convId = rpcData.id;
        if (convId) {
          await supabase.from('conversations').update({ is_self_chat: true }).eq('id', convId);
          setSelfChatId(convId);
        }
      }
    } catch (err) {
      console.error('[ensureSelfChat] Failed:', err);
      ensureSelfChatRef.current = false;
    }
  }

  useEffect(() => {
    if (!user) return;
    // Show cached conversations instantly while RPC loads
    try {
      const cached = localStorage.getItem(`bubble-convos-${user.id}`);
      if (cached) {
        const cachedConvs = JSON.parse(cached) as Conversation[];
        setConversations(cachedConvs);
        setConvLoading(false);
      }
    } catch { /* ignore */ }
    loadConversations();

    let reloadTimeout: ReturnType<typeof setTimeout>;
    const debouncedReload = () => {
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(loadConversations, 300);
    };

    const channel = supabase
      .channel('conversations_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, debouncedReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, debouncedReload)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, debouncedReload)
      .subscribe();

    // Periodic refresh: picks up status/last_seen changes even without realtime events
    const refreshInterval = setInterval(loadConversations, 45000);

    // Periodic cleanup of stale online users (don't reload conversations after)
    const cleanupInterval = setInterval(() => {
      supabase.rpc('cleanup_stale_online_users').catch(() => {});
    }, 120000);

    return () => {
      clearTimeout(reloadTimeout);
      clearInterval(refreshInterval);
      clearInterval(cleanupInterval);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadPending = useRef(false);

  async function loadConversations() {
    if (!user) return;
    if (loadInProgress.current) {
      loadPending.current = true;
      return;
    }
    loadInProgress.current = true;

    try {
      const rpcPromise = supabase.rpc('get_user_conversations', {
        p_user_id: user.id,
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('conv_timeout')), 10000)
      );
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise])
        .catch((e: Error) => ({ data: null, error: e }));

      if (error) {
        console.error('[loadConversations] RPC error:', error);
        throw error;
      }

      let result = data as any;
      if (typeof result === 'string') {
        try { result = JSON.parse(result); } catch { result = null; }
      }

      const conversationsData = result?.conversations ?? (Array.isArray(result) ? result : []);

      if (!Array.isArray(conversationsData)) {
        console.warn('[loadConversations] No conversations in response:', data);
        setConversations([]);
        return;
      }

      const enriched = conversationsData as Conversation[];

      setConversations(prev => {
        // Preserve unread_count for the currently selected conversation if the user
        // is actively viewing it (markAsRead will have already zeroed it locally).
        const selectedId = selected?.id;
        if (!selectedId) return enriched;
        return enriched.map(c => {
          if (c.id === selectedId) {
            const prevConv = prev.find(p => p.id === selectedId);
            // If the user is viewing this chat and locally has 0 unread, keep it 0
            // so the badge doesn't flash back on before markAsRead propagates.
            if (prevConv && (prevConv.unread_count ?? 0) === 0) {
              return { ...c, unread_count: 0 };
            }
          }
          return c;
        });
      });
      try {
        localStorage.setItem(`bubble-convos-${user.id}`, JSON.stringify(enriched));
      } catch { /* ignore quota */ }

      setSelected(prev => {
        if (!prev) return prev;
        const updated = enriched.find(c => c.id === prev.id);
        return updated ?? prev;
      });
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setConvLoading(false);
      loadInProgress.current = false;
      // If another reload was requested while this one was running, run it now
      if (loadPending.current) {
        loadPending.current = false;
        loadConversations();
      }
    }
  }

  function handleSelectConv(conv: Conversation) {
    setShowFantasyLeagues(false);
    setSelected(conv);
    // NOTE: last_read_at is now updated inside ChatWindow when messages are actually visible,
    // not here on selection — so read receipts only fire when the user truly sees the messages.
    setConversations(prev =>
      prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
    );
  }

  async function handleShareGif(convId: string, gifId: string) {
    if (!user) return;
    try {
      const { data: existing, error: findError } = await supabase
        .from('gif_collections')
        .select('id')
        .eq('conversation_id', convId)
        .maybeSingle();
      if (findError) throw findError;

      let collectionId = existing?.id;
      if (!collectionId) {
        const { data: collection, error: collectionError } = await supabase
          .from('gif_collections')
          .insert({ name: 'Shared GIFs', conversation_id: convId, created_by: user.id, is_group_collection: true })
          .select('id')
          .maybeSingle();
        if (collectionError || !collection) throw collectionError ?? new Error('Unable to create shared GIF collection');
        collectionId = collection.id;
      }

      const { error: itemError } = await supabase.from('gif_collection_items').upsert({
        collection_id: collectionId,
        gif_id: gifId,
        added_by: user.id,
      }, { onConflict: 'collection_id,gif_id' });
      if (itemError) throw itemError;
    } catch (err) {
      console.error('Failed to share GIF access:', err);
    }
  }

  function handleNewChatCreated(conv: Conversation) {
    setShowNewChat(false);
    // Prepend the new conversation immediately instead of waiting for reload
    setConversations(prev => {
      if (prev.some(c => c.id === conv.id)) return prev;
      return [conv, ...prev];
    });
    setSelected(conv);
    // Force a reload in the background to get fresh data — reset the guard
    loadInProgress.current = false;
    loadConversations();
  }

  function handleLeaveOrTrash(convId: string) {
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (selected?.id === convId) setSelected(null);
  }

  // Mobile touch: swipe left/right for navigation arrows
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const start = touchStartRef.current;
    if (!start) return;
    const dx = Math.abs(touch.clientX - start.x);
    const dy = Math.abs(touch.clientY - start.y);
    // Show navigation arrows on horizontal swipe
    if (dx > 30 && dy < dx) {
      if (touch.clientX > start.x && selected) setShowLeftArrow(true);
      if (touch.clientX < start.x && !selected) setShowRightArrow(true);
    }
  }, [selected]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    setShowLeftArrow(false);
    setShowRightArrow(false);

    const touch = e.changedTouches[0];
    const start = touchStartRef.current;
    if (!start) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;

    if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 60 && elapsed < 500) {
      if (deltaX > 0 && selected) setSelected(null); // swipe right -> back
    }
    touchStartRef.current = null;
  }, [selected]);

  // Desktop: mouse swipe (Apple Magic Mouse) + touchpad two-finger horizontal swipe
  const wheelAccumRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const acc = wheelAccumRef.current;
    const now = Date.now();
    // Reset accumulator if it's been a while
    if (now - acc.time > 300) { acc.x = 0; acc.y = 0; }
    acc.x += e.deltaX;
    acc.y += e.deltaY;
    acc.time = now;

    // Horizontal swipe with enough momentum (Apple Magic Mouse / trackpad)
    if (Math.abs(acc.x) > 80 && Math.abs(acc.x) > Math.abs(acc.y) * 1.5) {
      if (acc.x > 0 && selected) {
        setSelected(null); // swipe right -> back
        acc.x = 0; acc.y = 0;
      }
    }
  }, [selected]);

  // Update browser tab title with unread count when setting is enabled
  useEffect(() => {
    const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
    if (profile?.unread_badge_enabled && totalUnread > 0) {
      document.title = `(${totalUnread}) Bubble`;
    } else {
      document.title = 'Bubble';
    }
  }, [conversations, profile?.unread_badge_enabled]);

  return (
    <div
      className="flex bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300"
      style={{ height: '100dvh' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Mobile swipe arrow overlays */}
      {showLeftArrow && (
        <div className="md:hidden fixed left-3 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-slate-200/90 dark:bg-slate-800/90 border border-slate-300 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-white pointer-events-none shadow-xl">
          <ChevronLeft size={20} />
        </div>
      )}
      {showRightArrow && (
        <div className="md:hidden fixed right-3 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-slate-200/90 dark:bg-slate-800/90 border border-slate-300 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-white pointer-events-none shadow-xl">
          <ChevronRight size={20} />
        </div>
      )}

      {/* Sidebar: hidden on mobile when a chat is selected */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-auto flex-shrink-0`}>
        <Sidebar
          conversations={conversations}
          loading={convLoading}
          selectedId={selected?.id ?? null}
          onSelect={handleSelectConv}
          onNewChat={() => setShowNewChat(true)}
          onGifStudio={() => setShowGifStudio(true)}
          onSettings={() => setShowSettings(true)}
          onOpenPeopleDrawer={() => setShowPeopleDrawer(true)}
          onOpenFantasyLeagues={() => { setShowFantasyLeagues(true); setShowTrash(false); setSelected(null); }}
          onCreateFantasyLeague={() => setShowFantasyManager(true)}
          showFantasyLeagues={showFantasyLeagues}
          onToggleFantasyLeagues={() => { setShowFantasyLeagues(false); setSelected(null); }}
          showTrash={showTrash}
          onToggleTrash={() => setShowTrash(t => !t)}
        />
      </div>

      {/* Main area */}
      <div className={`${!selected ? 'hidden md:flex' : 'flex'} flex-1 flex-col overflow-hidden`}>
        {selected ? (
          <ChatWindow
            key={selected.id}
            conversation={selected}
            onOpenGifStudio={() => setShowGifStudio(true)}
            onBack={() => setSelected(null)}
            onLeave={handleLeaveOrTrash}
            onTrash={handleLeaveOrTrash}
            onMembersChanged={loadConversations}
          />
        ) : (
          // Desktop welcome — hidden on mobile (mobile shows sidebar)
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center px-6 py-12 gap-0">
            <div className="w-24 h-24 rounded-[28px] overflow-hidden mb-6 shadow-2xl ring-2 ring-slate-200 dark:ring-white/10 flex-shrink-0">
              <img src={getLogoUrl(resolvedTheme)} alt="Bubble" className="w-full h-full object-cover" />
            </div>
            <h2 className="text-slate-900 dark:text-white font-bold text-[26px] mb-3 leading-tight">{t('welcome')}</h2>
            <p className="text-slate-500 dark:text-slate-500 text-[15px] max-w-[280px] leading-relaxed mb-8">
              {t('welcomeSub')}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setShowNewChat(true)}
                className="flex items-center gap-2 px-7 py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[15px] rounded-2xl transition-all shadow-lg shadow-sky-500/25"
              >
                <MessageCircle size={18} />
                {t('startConversation')}
              </button>
              {selfChatId && (
                <button
                  onClick={() => {
                    const selfConv = conversations.find(c => c.is_self_chat);
                    if (selfConv) handleSelectConv(selfConv);
                  }}
                  className="flex items-center gap-2 px-7 py-3.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-semibold text-[15px] rounded-2xl transition-all border border-slate-300 dark:border-white/10"
                >
                  <StickyNote size={18} />
                  {t('myNotes')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreated={handleNewChatCreated}
          preloadedProfiles={allProfiles}
        />
      )}
      {showGifStudio && (
        <GifStudio
          onClose={() => setShowGifStudio(false)}
          conversations={conversations}
          onShareGif={handleShareGif}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showPeopleDrawer && (
        <PeopleDrawer
          onClose={() => setShowPeopleDrawer(false)}
          onSelectChat={handleSelectConv}
        />
      )}
      {showFantasyManager && (
        <FantasyFootballModal
          onClose={() => setShowFantasyManager(false)}
          onCreated={(conv) => { setShowFantasyManager(false); setShowFantasyLeagues(false); handleNewChatCreated(conv); }}
        />
      )}
    </div>
  );
}
