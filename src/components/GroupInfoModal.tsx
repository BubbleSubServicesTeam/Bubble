import { useState, useEffect, useCallback } from 'react';
import { supabase, Conversation, Profile, effectiveStatus } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Avatar from './Avatar';
import { X, Search, UserPlus, UserMinus, Crown, Users, Check } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type Props = {
  conversation: Conversation;
  onClose: () => void;
  onMembersChanged: () => void;
};

export default function GroupInfoModal({ conversation, onClose, onMembersChanged }: Props) {
  const { user, profile } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isOwner = conversation.created_by === user?.id;
  const memberIds = new Set(members.map(m => m.user_id));

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('conversation_members')
      .select('profiles:profiles!conversation_members_profile_user_id_fkey(*)')
      .eq('conversation_id', conversation.id);
    const profiles = (data ?? []).map((d: any) => d.profiles).filter(Boolean) as Profile[];
    setMembers(profiles);
    setLoading(false);
  }, [conversation.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, user_id, display_name, first_name, last_name, avatar_url, status, status_message, last_seen, created_at')
          .neq('user_id', user?.id ?? '')
          .ilike('display_name', `%${search}%`)
          .or(`display_name.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
          .limit(10);
        if (error) throw error;
        setSearchResults((data as Profile[]) ?? []);
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [search, user]);

  async function addMember(p: Profile) {
    setError('');
    try {
      const { error } = await supabase.rpc('add_conversation_member', {
        p_conv_id: conversation.id,
        p_user_id: p.user_id,
      });
      if (error) throw error;
      setMembers(prev => [...prev, p]);
      onMembersChanged();
      setSearch('');
      setSearchResults([]);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to add member');
    }
  }

  async function removeMember(p: Profile) {
    setError('');
    setRemovingId(p.user_id);
    try {
      const { error } = await supabase.rpc('remove_conversation_member', {
        p_conv_id: conversation.id,
        p_user_id: p.user_id,
      });
      if (error) throw error;
      setMembers(prev => prev.filter(m => m.user_id !== p.user_id));
      onMembersChanged();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove member');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 flex items-center justify-center">
              <Users size={20} className="text-sky-400" />
            </div>
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-lg leading-tight">{conversation.name ?? 'Group Chat'}</h2>
              <p className="text-slate-500 text-xs">{members.length} members</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!showAdd ? (
            <>
              {/* Add people button */}
              <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5">
                <button
                  onClick={() => setShowAdd(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 font-medium text-sm transition-all"
                >
                  <UserPlus size={18} />
                  Add people
                </button>
              </div>

              {/* Members list */}
              <div className="px-3 py-2">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <BubbleLoader size={36} />
                  </div>
                ) : (
                  members.map(m => (
                    <div
                      key={m.user_id}
                      className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-slate-50 dark:bg-white/[0.03] transition-all"
                    >
                      <Avatar profile={m} size="md" showStatus />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-slate-900 dark:text-white font-semibold text-[14px] truncate">
                            {m.user_id === user?.id ? 'You' : (m.display_name || 'Unknown')}
                          </p>
                          {conversation.created_by === m.user_id && (
                            <Crown size={13} className="text-amber-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className={`text-[12px] capitalize ${effectiveStatus(m) === 'online' ? 'text-green-400' : 'text-slate-600'}`}>
                          {effectiveStatus(m) === 'online' ? 'Online' : 'Offline'}
                          {m.status_message ? ` · ${m.status_message}` : ''}
                        </p>
                      </div>
                      {isOwner && m.user_id !== user?.id && (
                        <button
                          onClick={() => removeMember(m)}
                          disabled={removingId === m.user_id}
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all disabled:opacity-50"
                          title="Remove member"
                        >
                          {removingId === m.user_id ? (
                            <BubbleLoader size={22} />
                          ) : (
                            <UserMinus size={16} />
                          )}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {error && (
                <div className="px-6 pb-4">
                  <p className="text-red-400 text-xs text-center">{error}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Add members search */}
              <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5">
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => { setShowAdd(false); setSearch(''); setSearchResults([]); setError(''); }}
                    className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                  >
                    <X size={16} />
                  </button>
                  <h3 className="text-slate-900 dark:text-white font-semibold text-[15px]">Add members</h3>
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search people by name..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"
                    autoFocus
                  />
                </div>
              </div>

              {/* Search results */}
              <div className="px-3 py-2">
                {searchLoading ? (
                  <div className="flex justify-center py-6">
                    <BubbleLoader size={32} />
                  </div>
                ) : search && searchResults.length === 0 ? (
                  <p className="text-center text-slate-500 text-sm py-6">No users found</p>
                ) : (
                  searchResults.map(p => {
                    const alreadyMember = memberIds.has(p.user_id);
                    return (
                      <div
                        key={p.user_id}
                        className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-slate-50 dark:bg-white/[0.03] transition-all"
                      >
                        <Avatar profile={p} size="md" showStatus />
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 dark:text-white font-semibold text-[14px] truncate">{p.display_name}</p>
                          <p className={`text-[12px] capitalize ${effectiveStatus(p) === 'online' ? 'text-green-400' : 'text-slate-600'}`}>
                            {effectiveStatus(p) === 'online' ? 'Online' : 'Offline'}
                          </p>
                        </div>
                        {alreadyMember ? (
                          <span className="flex items-center gap-1 text-slate-500 text-xs font-medium pr-2">
                            <Check size={14} /> Added
                          </span>
                        ) : (
                          <button
                            onClick={() => addMember(p)}
                            className="px-4 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 font-medium text-xs transition-all flex items-center gap-1.5"
                          >
                            <UserPlus size={14} /> Add
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {error && (
                <div className="px-6 pb-4">
                  <p className="text-red-400 text-xs text-center">{error}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
