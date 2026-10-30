import { useState, useEffect } from 'react';
import { supabase, Conversation, Profile, Message, smartName, getDisplayName } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useTheme, getLogoUrl } from '../lib/theme';
import { useAppLang } from '../lib/i18n';
import Avatar from './Avatar';
import { Plus, Search, Settings, LogOut, Sparkles, MessageCircle, Trash2, Trophy, X, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ArrowUpDown, Compass } from 'lucide-react';
import BubbleLoader from './BubbleLoader';
import { ContactPriorityMap, conversationPriority, priorityRank } from '../lib/contactPriority';

type FFLeague = {
  id: string; name: string; conversation_id: string | null;
  sleeper_league_id: string | null; draft_status: string; season: number;
  num_teams: number; [key: string]: any;
};

type Props = {
  conversations: Conversation[];
  contactPriorities: ContactPriorityMap;
  loading?: boolean;
  selectedId: string | null;
  onSelect: (conv: Conversation) => void;
  onNewChat: () => void;
  onGifStudio: () => void;
  onOpenDiscover: () => void;
  onSettings: () => void;
  onOpenPeopleDrawer?: () => void;
  showTrash?: boolean;
  onToggleTrash?: () => void;
  onOpenFantasyLeagues?: () => void;
  onCreateFantasyLeague?: () => void;
  showFantasyLeagues?: boolean;
  onToggleFantasyLeagues?: () => void;
};

export default function Sidebar({ conversations, contactPriorities, loading, selectedId, onSelect, onNewChat, onGifStudio, onOpenDiscover, onSettings, onOpenPeopleDrawer, showTrash, onToggleTrash, onOpenFantasyLeagues, onCreateFantasyLeague, showFantasyLeagues, onToggleFantasyLeagues }: Props) {
  const { profile, user, signOut } = useAuth();
  const { theme, resolvedTheme } = useTheme();
  const { t } = useAppLang();
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Conversation | null>(null);
  const [leagues, setLeagues] = useState<FFLeague[]>([]);
  const [sortMode, setSortMode] = useState<'recent' | 'active' | 'unread' | 'name'>(() => {
    try { return (localStorage.getItem('bubble-chat-sort') as 'recent' | 'active' | 'unread' | 'name') || 'recent'; } catch { return 'recent'; }
  });
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});

  async function permanentlyDeleteConv(conv: Conversation) {
    if (!profile) return;
    await supabase.from('conversation_members').delete().eq('conversation_id', conv.id).eq('user_id', profile.user_id);
    setDeleteConfirm(null);
  }

  async function restoreConv(conv: Conversation) {
    if (!profile) return;
    await supabase.from('conversation_members').update({ trashed_at: null }).eq('conversation_id', conv.id).eq('user_id', profile.user_id);
  }

  // All non-self profiles for smart name disambiguation
  const myUserId = user?.id ?? profile?.user_id;
  const allPeers = conversations.filter(c => !c.is_self_chat).flatMap(c => c.members ?? []).filter(m => m.user_id !== myUserId);

  const query = search.trim().toLowerCase();
  const trashedConversations = conversations.filter(c => {
    const member = c.members?.find(m => m.user_id === myUserId);
    return member?.trashed_at;
  });
  const activeConversations = conversations.filter(c => {
    const member = c.members?.find(m => m.user_id === myUserId);
    return !member?.trashed_at;
  });
  const displayConversations = showTrash ? trashedConversations : activeConversations;

  // Fantasy league conversation IDs — these are shown in their own section, not the main list
  const ffConvIds = new Set(leagues.map(l => l.conversation_id).filter(Boolean) as string[]);

  const filtered = displayConversations.filter(conv => {
    // In normal view: hide fantasy league convs from the main chat list (they have their own section)
    if (!showTrash && ffConvIds.has(conv.id)) return false;
    if (!query) return true;
    if (conv.is_self_chat) return 'my notes'.includes(query);
    if (conv.is_group) return (conv.name || '').toLowerCase().includes(query);
    const other = conv.members?.find(m => m.user_id !== myUserId);
    return smartName(other, allPeers).toLowerCase().includes(query);
  });

  function effectiveUnread(conv: Conversation) {
    return conversationPriority(conv, myUserId, contactPriorities) === 'silenced' ? 0 : (conv.unread_count ?? 0);
  }

  const ordered = [...filtered].sort((a, b) => {
    const rankDiff = priorityRank(conversationPriority(a, myUserId, contactPriorities)) - priorityRank(conversationPriority(b, myUserId, contactPriorities));
    if (rankDiff !== 0) return rankDiff;
    if (sortMode === 'name') return getConvName(a).localeCompare(getConvName(b));
    if (sortMode === 'unread') return effectiveUnread(b) - effectiveUnread(a) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    if (sortMode === 'active') return (messageCounts[b.id] ?? 0) - (messageCounts[a.id] ?? 0) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  function formatTime(ts?: string) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return 'now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604_800_000) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function getConvName(conv: Conversation) {
    if (conv.is_group) return conv.name ?? 'Group Chat';
    if (conv.is_self_chat) return 'My Notes';
    const other = conv.members?.find(m => m.user_id !== myUserId);
    return smartName(other, allPeers);
  }

  function getConvAvatar(conv: Conversation) {
    if (conv.is_group) return null;
    if (conv.is_self_chat) return profile;
    return conv.members?.find(m => m.user_id !== myUserId) ?? null;
  }

  function getLastMsg(conv: Conversation) {
    const msg = conv.last_message;
    if (!msg) return conv.is_self_chat ? 'Add a note...' : 'Start a conversation';
    if (msg.deleted_at) return 'Message deleted';
    const isMe = msg.sender_id === myUserId;
    const prefix = isMe ? 'You: ' : '';
    switch (msg.message_type) {
      case 'image': return `${prefix}Sent a photo`;
      case 'gif': return `${prefix}Sent a GIF`;
      case 'file': return `${prefix}Sent a file`;
      case 'voicemail': return `${prefix}Left a voicemail`;
      case 'call_started': return `${prefix}Call`;
      case 'call_ended': return 'Call ended';
      default: return `${prefix}${msg.content ?? ''}`;
    }
  }

  const myDisplayName = getDisplayName(profile, false);
  const myFullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.display_name || '';

  // Load fantasy leagues
  useEffect(() => {
    if (!user || conversations.length === 0) return;
    const ids = conversations.map(conv => conv.id);
    supabase.from('messages').select('conversation_id').in('conversation_id', ids).then(({ data }) => {
      const counts: Record<string, number> = {};
      (data ?? []).forEach(row => { counts[row.conversation_id] = (counts[row.conversation_id] ?? 0) + 1; });
      setMessageCounts(counts);
    });
  }, [user, conversations]);

  useEffect(() => {
    try { localStorage.setItem('bubble-chat-sort', sortMode); } catch { /* ignore */ }
  }, [sortMode]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('ff_leagues')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setLeagues(data as FFLeague[]); });
  }, [user]);

  function handleSelectLeague(league: FFLeague) {
    if (!league.conversation_id) return;
    const conv = conversations.find(c => c.id === league.conversation_id);
    if (conv) onSelect(conv);
  }

  function renderConv(conv: Conversation) {
    const isSelected = conv.id === selectedId;
    const other = getConvAvatar(conv);
    const unread = effectiveUnread(conv);
    const name = getConvName(conv);
    const lastMsg = getLastMsg(conv);
    const time = formatTime(conv.last_message?.created_at ?? conv.updated_at);

    return (
      <button
        key={conv.id}
        onClick={() => onSelect(conv)}
        className={`w-full flex items-center gap-3 px-4 py-3 transition-all group relative ${
          isSelected ? 'bg-slate-100 dark:bg-white/[0.06]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
        }`}
      >
        {isSelected && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-sky-500 rounded-full" />}
        <div className="flex-shrink-0">
          {conv.is_group ? (
            conv.avatar_url ? (
              <img src={conv.avatar_url} alt={name} className="w-10 h-10 rounded-full object-cover shadow-md" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">{(name || 'G').charAt(0).toUpperCase()}</span>
              </div>
            )
          ) : (
            <Avatar profile={other} size="md" showStatus={!conv.is_self_chat} />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <span className={`text-[14px] font-semibold truncate leading-tight ${
              isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-100'
            }`}>
              {name}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-600 flex-shrink-0">{time}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[12px] truncate leading-snug ${
              unread > 0 ? 'text-slate-700 dark:text-slate-300 font-medium' : 'text-slate-500 dark:text-slate-500'
            }`}>
              {lastMsg}
            </p>
            {unread > 0 && (
              <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 bg-sky-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="w-full md:w-[300px] flex-shrink-0 bg-white dark:bg-[#0d1117] border-r border-slate-200 dark:border-white/[0.05] flex flex-col h-full transition-colors duration-300">
      {/* Header */}
      <div className="px-5 pt-[max(3.5rem,env(safe-area-inset-top))] md:pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-[14px] overflow-hidden ring-1 ring-slate-200 dark:ring-white/[0.08] shadow-lg">
            <img src={getLogoUrl(resolvedTheme)} alt="Bubble" className="w-full h-full object-cover" />
          </div>
          <span className="text-slate-900 dark:text-white font-bold text-[19px] tracking-tight">Bubble</span>
        </div>
        <div className="flex items-center gap-0.5">
          <IconBtn onClick={onOpenFantasyLeagues ?? (() => {})} title="Fantasy Leagues">
            <Trophy size={15} />
          </IconBtn>
          <IconBtn onClick={onOpenDiscover} title="Discover"><Compass size={15} /></IconBtn>
          <IconBtn onClick={onGifStudio} title="GIF Studio"><Sparkles size={15} /></IconBtn>
          <IconBtn onClick={onToggleTrash} title="Trash"><Trash2 size={15} danger={showTrash} /></IconBtn>
          <button
            onClick={onNewChat}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-400 transition-all text-white shadow-lg shadow-blue-500/30 ml-1"
            title="New Chat"
          >
            <Plus size={18} strokeWidth={2.5} className="mx-auto" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3 space-y-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
          <input
            type="text"
            placeholder={t('search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.05] rounded-xl pl-8 pr-3 py-2 text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500/40 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown size={13} className="text-slate-400" />
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as 'recent' | 'active' | 'unread' | 'name')}
            className="flex-1 bg-transparent text-[12px] text-slate-500 dark:text-slate-400 focus:outline-none cursor-pointer"
            aria-label="Sort conversations"
          >
            <option value="recent">{t('sortRecent')}</option>
            <option value="active">{t('sortActive')}</option>
            <option value="unread">{t('sortUnread')}</option>
            <option value="name">{t('sortName')}</option>
          </select>
        </div>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {showFantasyLeagues ? (
          <div>
            <div className="flex items-center gap-3 px-4 py-3 border-y border-slate-200 dark:border-white/[0.05]">
              <button
                onClick={onToggleFantasyLeagues}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-all"
                title="Back to chats"
              >
                <ChevronDown size={16} className="rotate-90" />
              </button>
              <div>
                <p className="text-slate-900 dark:text-white text-[14px] font-semibold">Fantasy Leagues</p>
                <p className="text-slate-500 text-[11px]">Your leagues and league chats</p>
              </div>
            </div>
            <div className="p-3 space-y-2">
              {leagues.filter(league => {
                const conv = conversations.find(c => c.id === league.conversation_id);
                const member = conv?.members?.find(m => m.user_id === myUserId);
                return !member?.trashed_at;
              }).map(league => {
                const conv = conversations.find(c => c.id === league.conversation_id);
                const isSelected = conv?.id === selectedId;
                return (
                  <button
                    key={league.id}
                    onClick={() => handleSelectLeague(league)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all ${isSelected ? 'bg-sky-500/10 ring-1 ring-sky-500/30' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md flex-shrink-0">
                      <Trophy size={17} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">{league.name}</p>
                      <p className="text-[12px] text-slate-500 truncate">{league.draft_status === 'drafting' ? 'Drafting live' : league.draft_status === 'completed' ? 'Season active' : 'Draft pending'}{league.num_teams ? ` · ${league.num_teams} teams` : ''}</p>
                    </div>
                    <ChevronRight size={15} className="text-slate-400 flex-shrink-0" />
                  </button>
                );
              })}
              {leagues.length === 0 && (
                <div className="py-10 text-center">
                  <Trophy size={28} className="mx-auto mb-3 text-slate-400 dark:text-slate-600" />
                  <p className="text-slate-500 text-[13px]">No fantasy leagues yet</p>
                </div>
              )}
              <button
                onClick={onCreateFantasyLeague}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 text-[13px] font-medium transition-all"
              >
                <Plus size={15} /> Create or join a league
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <BubbleLoader size={36} />
            <p className="text-slate-500 dark:text-slate-600 text-[13px]">Loading conversations...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
            {showTrash && (
              <button onClick={onToggleTrash} className="self-start -mt-8 mb-2 w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-all" title="Back to chats">
                <ChevronLeft size={16} />
              </button>
            )}
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center">
              <MessageCircle size={20} className="text-slate-400 dark:text-slate-600" />
            </div>
            <p className="text-slate-500 dark:text-slate-500 text-[13px]">
              {search ? t('noConversationsFound') : (showTrash ? t('noTrashedChats') : t('noConversations'))}
            </p>
            {!search && !showTrash && (
              <button onClick={onNewChat} className="text-sky-400 hover:text-sky-300 text-[13px] font-medium transition-colors">
                {t('startFirstChat')}
              </button>
            )}
          </div>
        ) : showTrash ? (
          <div>
            <div className="flex items-center gap-3 px-4 py-3 border-y border-slate-200 dark:border-white/[0.05]">
              <button onClick={onToggleTrash} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-all" title={t('backToChats')}>
                <ChevronLeft size={16} />
              </button>
              <div>
                <p className="text-slate-900 dark:text-white text-[14px] font-semibold">{t('trash')}</p>
                <p className="text-slate-500 text-[11px]">{t('trashSub')}</p>
              </div>
            </div>
            <div className="space-y-1">
            {ordered.map(conv => {
              const ffLeague = leagues.find(l => l.conversation_id === conv.id);
              return (
                <div key={conv.id} className="flex items-center gap-1 group">
                  <button onClick={() => onSelect(conv)} className={`flex-1 flex items-center gap-3 px-4 py-3 transition-all relative ${conv.id === selectedId ? 'bg-slate-100 dark:bg-white/[0.06]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'}`}>
                    {conv.id === selectedId && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-sky-500 rounded-full" />}
                    <div className="flex-shrink-0">
                      {ffLeague ? (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md"><Trophy size={16} className="text-white" /></div>
                      ) : conv.is_group ? (
                        conv.avatar_url ? <img src={conv.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shadow-md" /> : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md"><span className="text-white font-bold text-sm">{(getConvName(conv) || 'G').charAt(0).toUpperCase()}</span></div>
                      ) : <Avatar profile={getConvAvatar(conv)} size="md" showStatus={!conv.is_self_chat} />}
                    </div>
                    <div className="flex-1 min-w-0 text-left"><p className="text-[14px] font-semibold truncate text-slate-900 dark:text-white">{ffLeague ? ffLeague.name : getConvName(conv)}</p><p className="text-[12px] truncate text-slate-500">{ffLeague ? `Fantasy League · ${getLastMsg(conv)}` : getLastMsg(conv)}</p></div>
                  </button>
                  <button onClick={() => restoreConv(conv)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-500 hover:bg-sky-500/10 transition-all flex-shrink-0 opacity-0 group-hover:opacity-100" title={t('restore')}><Plus size={14} className="rotate-45" /></button>
                  <button onClick={() => setDeleteConfirm(conv)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-all flex-shrink-0 opacity-0 group-hover:opacity-100" title={t('deleteForever')}><Trash2 size={14} /></button>
                </div>
              );
            })}
            </div>
          </div>
        ) : (
          <>
            {ordered.map(renderConv)}
          </>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center"><AlertTriangle size={20} className="text-red-500" /></div>
              <div><p className="text-slate-900 dark:text-white font-bold text-sm">{t('deleteConfirmTitle')}</p><p className="text-slate-500 text-xs">"{getConvName(deleteConfirm)}" {t('deleteConfirmBody')}</p></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-all">Cancel</button>
              <button onClick={() => permanentlyDeleteConv(deleteConfirm)} className="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-sm font-medium transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* User footer — settings & sign out, pinned to bottom edge on mobile */}
      <div className="p-3 bg-white dark:bg-[#0d1117] border-t border-slate-200 dark:border-white/[0.05] flex items-center gap-2.5" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))', paddingTop: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="flex-shrink-0">
          <Avatar profile={profile} size="sm" showStatus />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate leading-tight">{myDisplayName}</p>
          {myFullName !== myDisplayName && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{myFullName}</p>
          )}
          {profile?.status_message && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{profile.status_message}</p>
          )}
        </div>
        <button
          onClick={onSettings}
          title="Settings"
          className="relative w-8 h-8 rounded-xl flex items-center justify-center transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={signOut}
          title="Sign out"
          className="relative w-8 h-8 rounded-xl flex items-center justify-center transition-all text-slate-500 dark:text-slate-400 hover:bg-red-500/10 hover:text-red-500"
        >
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}

function IconBtn({ onClick, title, children, badge, danger }: {
  onClick: () => void; title?: string; children: React.ReactNode;
  badge?: number; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
        danger
          ? 'text-slate-400 dark:text-slate-600 hover:bg-red-500/10 hover:text-red-400'
          : 'text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      {children}
      {!!badge && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-sky-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center leading-none">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
