import { useEffect, useState } from 'react';
import { ShieldCheck, Trash2, UserPlus, Search, BadgeCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import BubbleLoader from './BubbleLoader';

type TrustCandidate = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  found_email: string | null;
  is_eligible: boolean;
};

type Trusted = { trustedUserId: string; name: string; avatarUrl: string | null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TrustedPeopleSettings() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Trusted[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<TrustCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<TrustCandidate | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPeople() {
    if (!user) return;
    setLoadError(false);
    const { data: rows, error: rowsError } = await supabase
      .from('trusted_contacts')
      .select('trusted_user_id')
      .eq('owner_id', user.id);
    if (rowsError) { setLoadError(true); return; }

    const ids = (rows ?? []).map(r => r.trusted_user_id as string);
    const loaded: Trusted[] = ids.map(id => ({ trustedUserId: id, name: 'Bubble user', avatarUrl: null }));
    if (ids.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', ids);
      if (profilesError) { setLoadError(true); return; }
      for (const p of profiles ?? []) {
        const entry = loaded.find(t => t.trustedUserId === p.user_id);
        if (entry) {
          entry.name = (p.display_name as string) || 'Bubble user';
          entry.avatarUrl = (p.avatar_url as string | null) ?? null;
        }
      }
    }
    setPeople(loaded);
  }

  useEffect(() => {
    loadPeople();
  }, [user]);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const value = query.trim();
    if (!user || !value) return;
    setSearching(true);
    setSearchError(null);
    const { data, error: searchRpcError } = await supabase.rpc('search_profiles_for_trust', { p_query: value });
    if (searchRpcError) { setSearchError("Couldn't search right now. Try again."); setSearching(false); return; }
    setCandidates((data ?? []) as TrustCandidate[]);
    setSearched(true);
    setSearching(false);
  }

  function startConfirm(candidate: TrustCandidate) {
    setConfirming(candidate);
    setConfirmEmail('');
    setError(null);
  }

  function cancelConfirm() {
    setConfirming(null);
    setConfirmEmail('');
    setError(null);
  }

  async function handleConfirmAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !confirming) return;
    const typed = confirmEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(typed)) { setError('Enter the email in the format name@example.com.'); return; }
    setAdding(true);
    setError(null);

    const expected = confirming.found_email?.trim().toLowerCase();
    if (!expected || typed !== expected) {
      setError("That email doesn't match this person's Bubble account. Check with them and try again.");
      setAdding(false);
      return;
    }
    if (people?.some(p => p.trustedUserId === confirming.user_id)) {
      setError('That person is already trusted.');
      setAdding(false);
      return;
    }
    if (!confirming.is_eligible) {
      setError('This person must be a close friend with chat activity on 3 different days first.');
      setAdding(false);
      return;
    }

    const { error: insertError } = await supabase
      .from('trusted_contacts')
      .insert({ owner_id: user.id, trusted_user_id: confirming.user_id });
    if (insertError) { setError("Couldn't add that person. Try again."); setAdding(false); return; }

    setConfirming(null);
    setConfirmEmail('');
    setQuery('');
    setCandidates([]);
    setSearched(false);
    await loadPeople();
    setAdding(false);
  }

  async function handleRemove(trustedUserId: string) {
    if (!user) return;
    setRemovingId(trustedUserId);
    setError(null);
    const { error: deleteError } = await supabase
      .from('trusted_contacts')
      .delete()
      .eq('owner_id', user.id)
      .eq('trusted_user_id', trustedUserId);
    if (deleteError) setError("Couldn't remove that person. Try again.");
    else await loadPeople();
    setRemovingId(null);
  }

  function CandidateAvatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
    if (avatarUrl) {
      return <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />;
    }
    return (
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center flex-shrink-0">
        <span className="text-white font-bold text-sm">{(name || '?').charAt(0).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={16} className="text-sky-500" />
        </div>
        <div>
          <p className="text-slate-900 dark:text-white font-semibold text-[14px] mb-1">Trusted people</p>
          <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed">
            If you ever forget your password, a trusted person can receive a secure reset link from Bubble and pass it to you.
            Trusted people must be close friends you have chatted with on at least 3 different days.
          </p>
        </div>
      </div>

      {loadError && <p className="text-[12px] text-red-500">Couldn't load your trusted people.</p>}
      {!loadError && people === null && (
        <div className="flex justify-center py-2"><BubbleLoader size={20} /></div>
      )}
      {people?.length === 0 && (
        <p className="text-[12px] text-slate-500 dark:text-slate-400">You haven't added anyone yet.</p>
      )}
      {people?.map(p => (
        <div key={p.trustedUserId} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            <CandidateAvatar avatarUrl={p.avatarUrl} name={p.name} />
            <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</span>
          </div>
          <button
            type="button"
            onClick={() => handleRemove(p.trustedUserId)}
            disabled={removingId !== null}
            aria-label={`Remove ${p.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {removingId === p.trustedUserId ? <BubbleLoader size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      ))}

      {!confirming && (
        <form onSubmit={runSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or email"
            className="flex-1 min-w-0 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-sky-500/60 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white text-[13px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="flex items-center gap-1.5 px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-[13px] font-semibold transition-colors disabled:bg-slate-300 dark:disabled:bg-white/[0.06] disabled:text-slate-400 dark:disabled:text-slate-600"
          >
            {searching ? <BubbleLoader size={18} /> : <><Search size={14} /> Search</>}
          </button>
        </form>
      )}

      {searchError && <p className="text-[12px] text-red-500">{searchError}</p>}

      {!confirming && searched && candidates.length === 0 && !searchError && (
        <p className="text-[12px] text-slate-500 dark:text-slate-400">No Bubble users matched that search.</p>
      )}

      {!confirming && candidates.length > 0 && (
        <ul className="space-y-2">
          {candidates.map(candidate => {
            const alreadyTrusted = people?.some(p => p.trustedUserId === candidate.user_id) ?? false;
            return (
              <li key={candidate.user_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02]">
                <CandidateAvatar avatarUrl={candidate.avatar_url} name={candidate.display_name} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">{candidate.display_name}</p>
                  {alreadyTrusted ? (
                    <p className="text-[11px] text-emerald-500 flex items-center gap-1"><BadgeCheck size={11} /> Already trusted</p>
                  ) : candidate.is_eligible ? (
                    <p className="text-[11px] text-emerald-500 flex items-center gap-1"><BadgeCheck size={11} /> Eligible</p>
                  ) : (
                    <p className="text-[11px] text-amber-500">Not eligible yet — needs close friend + 3 days of chat</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => startConfirm(candidate)}
                  disabled={alreadyTrusted || !candidate.is_eligible}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:bg-slate-200 dark:disabled:bg-white/[0.06] disabled:text-slate-400 dark:disabled:text-slate-600 text-white text-[12px] font-semibold transition-colors flex-shrink-0"
                >
                  <UserPlus size={13} /> Add
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {confirming && (
        <form onSubmit={handleConfirmAdd} className="space-y-2 p-3 rounded-xl border border-sky-500/30 bg-sky-500/5">
          <p className="text-[13px] font-medium text-slate-900 dark:text-white">Confirm {confirming.display_name}</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            To be sure this is the right person, type the email on their Bubble account.
          </p>
          <input
            type="email"
            value={confirmEmail}
            onChange={e => setConfirmEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-sky-500/60 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white text-[13px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={adding || !confirmEmail.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-[13px] font-semibold transition-colors disabled:bg-slate-300 dark:disabled:bg-white/[0.06] disabled:text-slate-400 dark:disabled:text-slate-600"
            >
              {adding ? <BubbleLoader size={18} /> : 'Add trusted person'}
            </button>
            <button
              type="button"
              onClick={cancelConfirm}
              className="px-4 rounded-xl text-[13px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-[12px] text-red-500">{error}</p>}
    </div>
  );
}
