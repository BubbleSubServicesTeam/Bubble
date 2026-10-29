import { useEffect, useState, useRef } from 'react';
import { supabase, Conversation, Profile, smartName } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { X, Search, UserPlus, Users, Check, Camera, Trophy } from 'lucide-react';
import Avatar from './Avatar';
import BubbleLoader from './BubbleLoader';
import FantasyFootballModal from './FantasyFootballModal';

type Props = {
  onClose: () => void;
  onCreated: (conv: Conversation) => void;
  preloadedProfiles?: Profile[];
};

export default function NewChatModal({ onClose, onCreated, preloadedProfiles }: Props) {
  const { user, profile } = useAuth();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [isFantasy, setIsFantasy] = useState(false);
  const [showFantasy, setShowFantasy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use preloaded profiles if available — shows instantly
  useEffect(() => {
    if (preloadedProfiles && preloadedProfiles.length > 0) {
      setSuggestions(preloadedProfiles);
      setLoading(false);
    }
  }, [preloadedProfiles]);

  // Fallback: load all profiles if not preloaded
  useEffect(() => {
    if (!user || preloadedProfiles?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, user_id, display_name, first_name, last_name, avatar_url, status, status_message, last_seen, created_at')
          .neq('user_id', user.id)
          .order('last_seen', { ascending: false, nullsFirst: false })
          .limit(100);
        if (cancelled) return;
        if (error) throw error;
        setSuggestions((data as Profile[]) ?? []);
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Search with debounce — filter contacts locally, fall back to server search
  useEffect(() => {
    if (!search.trim()) { setUsers([]); return; }

    const q = search.toLowerCase();
    const sourceList = preloadedProfiles?.length ? preloadedProfiles : suggestions;
    const localMatches = sourceList.filter(p =>
      p.first_name?.toLowerCase().startsWith(q) ||
      p.last_name?.toLowerCase().startsWith(q) ||
      p.display_name?.toLowerCase().startsWith(q)
    ).slice(0, 20);

    setUsers(localMatches);
    setLoading(false);
  }, [search, user, preloadedProfiles, suggestions]);

  function toggleSelect(p: Profile) {
    setSelected(prev =>
      prev.some(s => s.id === p.id)
        ? prev.filter(s => s.id !== p.id)
        : [...prev, p]
    );
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { setCreateError('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setCreateError('Image must be under 5 MB.'); return; }
    setCreateError('');
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `group-avatars/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('media').upload(path, file, { contentType: file.type, upsert: true });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      setGroupAvatar(urlData.publicUrl);
    } catch (err: any) {
      setCreateError(err.message ?? 'Upload failed');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function create() {
    if (selected.length === 0 || !user || creating) return;
    setCreating(true);
    setCreateError('');

    try {
      const isGroup = selected.length > 1;
      const name = isGroup
        ? (groupName.trim() || selected.map(p => p.display_name).join(', '))
        : null;

      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        'create_conversation',
        {
          p_other_user_ids: selected.map(p => p.user_id),
          p_is_group: isGroup,
          p_name: name,
          p_avatar_url: isGroup ? groupAvatar : null,
        }
      );

      if (rpcErr || !rpcResult) {
        setCreateError(rpcErr?.message ?? 'Failed to create conversation');
        return;
      }

      // RPC now returns full conversation data including members
      let rpcData = rpcResult as any;
      if (typeof rpcData === 'string') {
        try { rpcData = JSON.parse(rpcData); } catch { /* ignore */ }
      }

      if (!rpcData || !rpcData.id) {
        setCreateError('Invalid response from server');
        return;
      }

      // Use the full conversation object returned by the RPC directly
      onCreated(rpcData as Conversation);
    } catch (err: any) {
      setCreateError(err?.message ?? 'Failed to create conversation');
    } finally {
      setCreating(false);
    }
  }

  const displayList = search.trim() ? users : suggestions;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <UserPlus size={20} className="text-sky-500 dark:text-sky-400" />
            <h2 className="text-slate-900 dark:text-white font-bold text-lg">New Conversation</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Fantasy Football pill switch */}
          <div className="flex items-center justify-between bg-slate-100 dark:bg-white/5 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-sky-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Fantasy Football League</span>
            </div>
            <button
              onClick={() => { const next = !isFantasy; setIsFantasy(next); setShowFantasy(next); }}
              className={`relative w-12 h-6 rounded-full transition-colors ${isFantasy ? 'bg-sky-500' : 'bg-slate-300 dark:bg-white/10'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${isFantasy ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          {isFantasy && showFantasy && (
            <div className="border border-sky-500/20 rounded-xl p-3 bg-sky-500/5">
              <FantasyFootballModal
                onClose={() => { setShowFantasy(false); setIsFantasy(false); }}
                onCreated={(conv) => { setShowFantasy(false); setIsFantasy(false); onCreated(conv); }}
              />
            </div>
          )}

          {/* Group avatar upload (for groups) */}
          {selected.length > 1 && (
            <div className="flex flex-col items-center gap-3">
              <div
                className="relative w-20 h-20 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center cursor-pointer overflow-hidden group"
                onClick={() => fileInputRef.current?.click()}
              >
                {groupAvatar ? (
                  <img src={groupAvatar} alt="Group avatar" className="w-full h-full object-cover" />
                ) : (
                  <Users size={28} className="text-white" />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {uploadingAvatar ? (
                    <BubbleLoader size={22} />
                  ) : (
                    <Camera size={20} className="text-white" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFile}
                />
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-xs">Tap to add group photo</p>
            </div>
          )}

          {/* Selected chips */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/20 rounded-full pl-2 pr-1 py-1">
                  <Avatar profile={p} size="xs" />
                  <span className="text-sky-600 dark:text-sky-300 text-xs font-medium">{smartName(p, selected)}</span>
                  <button
                    onClick={() => toggleSelect(p)}
                    className="w-4 h-4 rounded-full bg-sky-500/20 hover:bg-sky-500/40 flex items-center justify-center text-sky-500 dark:text-sky-400"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Group name */}
          {selected.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 rounded-xl px-4 py-2.5">
              <Users size={14} className="text-slate-500 dark:text-slate-400" />
              <input
                type="text"
                placeholder="Group name..."
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none"
                autoFocus={selected.length > 1}
              />
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"
              autoFocus={selected.length <= 1}
            />
          </div>

          {/* Results / Suggestions */}
          <div className="max-h-56 overflow-y-auto space-y-1 scrollbar-thin">
            {loading && (
              <div className="flex justify-center py-8">
                <BubbleLoader size={40} />
              </div>
            )}
            {!loading && displayList.length === 0 && (
              <p className="text-center text-slate-500 dark:text-slate-400 text-sm py-4">
                {search.trim() ? 'No people by this name' : 'No people available'}
              </p>
            )}
            {!loading && !search.trim() && displayList.length > 0 && (
              <p className="text-slate-400 dark:text-slate-500 text-[11px] font-semibold uppercase tracking-wider px-3 pt-1 pb-2">People</p>
            )}
            {!loading && displayList.map(p => {
              const isSelected = selected.some(s => s.id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleSelect(p)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                    isSelected
                      ? 'bg-sky-500/10 border border-sky-500/20'
                      : 'hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10'
                  }`}
                >
                  <Avatar profile={p} size="sm" showStatus />
                  <div className="flex-1 text-left">
                    <p className="text-slate-900 dark:text-white text-sm font-medium">{smartName(p, displayList)}</p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs capitalize">{p.status}</p>
                  </div>
                  {isSelected && <Check size={16} className="text-sky-500 dark:text-sky-400" />}
                </button>
              );
            })}
          </div>

          {createError && (
            <p className="text-red-500 dark:text-red-400 text-xs text-center">{createError}</p>
          )}

          <button
            onClick={create}
            disabled={selected.length === 0 || creating}
            className="w-full py-3 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {creating ? (
              <BubbleLoader size={28} />
            ) : (
              <>
                {selected.length > 1 ? <Users size={16} /> : <UserPlus size={16} />}
                {selected.length === 0
                  ? 'Select someone'
                  : selected.length === 1
                  ? `Chat with ${smartName(selected[0], selected)}`
                  : `Create Group (${selected.length})`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
