import { useState, useEffect } from 'react';
import { supabase, Profile, Conversation, smartName, effectiveStatus } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';
import { X, MessageCircle, Search } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type Props = {
  onClose: () => void;
  onSelectChat: (conv: Conversation) => void;
};

export default function PeopleDrawer({ onClose, onSelectChat }: Props) {
  const { user, profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

  // Load contacts (people you already have conversations with)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: myMemberships } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', user.id);

        if (cancelled) return;
        if (!myMemberships || myMemberships.length === 0) { setContacts([]); return; }

        const convIds = myMemberships.map((m: any) => m.conversation_id);
        const { data: peerMembers } = await supabase
          .from('conversation_members')
          .select('user_id')
          .in('conversation_id', convIds)
          .neq('user_id', user.id);

        if (cancelled) return;
        if (!peerMembers || peerMembers.length === 0) { setContacts([]); return; }

        const peerUserIds = [...new Set(peerMembers.map((m: any) => m.user_id))];
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .in('user_id', peerUserIds)
          .order('last_seen', { ascending: false, nullsFirst: false })
          .limit(50);

        if (cancelled) return;
        setContacts(data as Profile[] ?? []);
      } catch (err) {
        console.error('[PeopleDrawer] Failed to load contacts:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Search: filter contacts locally; search everyone if no local matches
  useEffect(() => {
    if (!user) return;
    if (!search.trim()) { setUsers([]); return; }
    const q = search.toLowerCase();
    const localMatches = contacts.filter(p =>
      p.first_name?.toLowerCase().startsWith(q) ||
      p.last_name?.toLowerCase().startsWith(q) ||
      p.display_name?.toLowerCase().startsWith(q)
    ).slice(0, 20);

    if (localMatches.length > 0) {
      setUsers(localMatches);
      setLoading(false);
      return;
    }

    // No local matches — search all profiles (to find someone new)
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .neq('user_id', user.id)
          .or(`first_name.ilike.${search}%,last_name.ilike.${search}%,display_name.ilike.${search}%`)
          .order('last_seen', { ascending: false, nullsFirst: false })
          .limit(20);
        if (error) throw error;
        setUsers(data as Profile[] ?? []);
      } catch (err) {
        console.error('Search failed:', err);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [search, user, contacts]);

  const filtered = search.trim() ? users : contacts;

  async function startChat(otherUser: Profile) {
    if (!user) return;

    try {
      const { data: existingMems } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (existingMems && existingMems.length > 0) {
        const convIds = existingMems.map((m: any) => m.conversation_id);
        const { data: otherMems } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', otherUser.user_id)
          .in('conversation_id', convIds);

        if (otherMems && otherMems.length > 0) {
          const { data: conv } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', (otherMems[0] as any).conversation_id)
            .eq('is_group', false)
            .maybeSingle();

          if (conv) {
            onSelectChat({ ...conv, members: [profile!, otherUser] } as Conversation);
            onClose();
            return;
          }
        }
      }

      const { data, error } = await supabase.rpc('create_conversation', {
        p_other_user_ids: [otherUser.user_id],
        p_is_group: false,
        p_name: null,
      });

      if (error) throw error;
      if (!data) throw new Error('No conversation returned');

      const convId = (data as any).id;
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', convId)
        .maybeSingle();

      if (convErr) throw convErr;
      if (!conv) throw new Error('Could not load conversation');

      onSelectChat({ ...conv, members: [profile!, otherUser] } as Conversation);
      onClose();
    } catch (err: any) {
      console.error('Failed to start chat:', err);
      alert(err?.message ?? 'Failed to start conversation');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0e14] animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 pt-6 pb-4 bg-[#0a0e14]/95 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.05]" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/10 flex items-center justify-center">
            <MessageCircle size={20} className="text-sky-400" />
          </div>
          <div>
            <h2 className="text-slate-900 dark:text-white font-bold text-lg leading-tight">People</h2>
            <p className="text-slate-500 text-xs">{contacts.length} {contacts.length === 1 ? 'person' : 'people'}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
        >
          <X size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 px-5 py-3 bg-[#0a0e14]/95 backdrop-blur-md">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
          <input
            type="text"
            placeholder="Search people..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.07] rounded-2xl pl-10 pr-4 py-3 text-white placeholder-slate-400 dark:placeholder-slate-600 text-[14px] focus:outline-none focus:ring-1 focus:ring-sky-500/40 transition-all"
            autoFocus
          />
        </div>
      </div>

      {/* Users list — full screen scrollable */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <BubbleLoader size={40} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 px-8 text-center">
            <div className="w-14 h-14 rounded-3xl bg-slate-100 dark:bg-white/[0.04] flex items-center justify-center">
              <MessageCircle size={22} className="text-slate-400 dark:text-slate-600" />
            </div>
            <p className="text-slate-500 text-[14px]">
              {search ? 'No people found' : 'No contacts yet'}
            </p>
          </div>
        ) : (
          <div className="px-4 py-2">
            {filtered.map(person => (
              <button
                key={person.id}
                onClick={() => setSelectedProfile(person)}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-slate-100 dark:bg-white/[0.04] active:bg-white/[0.07] transition-all group"
              >
                <Avatar profile={person} size="lg" showStatus />
                <div className="flex-1 text-left min-w-0">
                  <p className="text-slate-900 dark:text-white font-semibold text-[15px] leading-tight truncate">{person.display_name}</p>
                  {person.status_message ? (
                    <p className="text-slate-500 text-[13px] mt-0.5 truncate">{person.status_message}</p>
                  ) : (
                    <p className={`text-[13px] mt-0.5 capitalize ${effectiveStatus(person) === 'online' ? 'text-green-400' : 'text-slate-600'}`}>
                      {effectiveStatus(person) === 'online' ? 'Online' : 'Offline'}
                    </p>
                  )}
                </div>
                <div className="w-10 h-10 rounded-2xl bg-sky-500/0 group-hover:bg-sky-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                  <MessageCircle size={18} className="text-sky-400" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom close hint */}
      <div className="flex-shrink-0 pb-6 pt-4 flex justify-center" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={onClose}
          className="px-8 py-3 rounded-2xl bg-slate-100 dark:bg-white/[0.06] hover:bg-white/[0.09] border border-slate-200 dark:border-white/[0.08] text-slate-400 hover:text-slate-900 dark:hover:text-white text-[14px] font-medium transition-all"
        >
          Close
        </button>
      </div>

      {selectedProfile && (
        <ProfileModal
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
          onStartChat={() => {
            startChat(selectedProfile);
          }}
        />
      )}
    </div>
  );
}
