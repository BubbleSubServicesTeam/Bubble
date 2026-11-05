import { useEffect, useState } from 'react';
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import BubbleLoader from './BubbleLoader';

type Trusted = { trustedUserId: string; name: string };

export default function TrustedPeopleSettings() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Trusted[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [identifier, setIdentifier] = useState('');
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
    let names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', ids);
      if (profilesError) { setLoadError(true); return; }
      names = new Map((profiles ?? []).map(p => [p.user_id as string, (p.display_name as string) || 'Bubble user']));
    }
    setPeople(ids.map(id => ({ trustedUserId: id, name: names.get(id) ?? 'Bubble user' })));
  }

  useEffect(() => {
    loadPeople();
  }, [user]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = identifier.trim();
    if (!user || !value) return;
    setAdding(true);
    setError(null);

    const { data: matches, error: lookupError } = await supabase.rpc('find_profile_for_trust', { identifier: value });
    if (lookupError) { setError("Couldn't search for that person. Try again."); setAdding(false); return; }

    const match = (matches ?? [])[0] as { found_user_id: string } | undefined;
    if (!match) { setError('No Bubble user matches that username, email, or ID.'); setAdding(false); return; }
    if (match.found_user_id === user.id) { setError("You can't add yourself as a trusted person."); setAdding(false); return; }
    if (people?.some(p => p.trustedUserId === match.found_user_id)) { setError('That person is already trusted.'); setAdding(false); return; }

    const { error: insertError } = await supabase
      .from('trusted_contacts')
      .insert({ owner_id: user.id, trusted_user_id: match.found_user_id });
    if (insertError) { setError("Couldn't add that person. Try again."); setAdding(false); return; }

    setIdentifier('');
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
          <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</span>
          <button
            type="button"
            onClick={() => handleRemove(p.trustedUserId)}
            disabled={removingId !== null}
            aria-label={`Remove ${p.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {removingId === p.trustedUserId ? <BubbleLoader size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      ))}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
          placeholder="Username, email, or user ID"
          className="flex-1 min-w-0 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] focus:border-sky-500/60 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white text-[13px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />
        <button
          type="submit"
          disabled={adding || !identifier.trim()}
          className="flex items-center gap-1.5 px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-[13px] font-semibold transition-colors disabled:bg-slate-300 dark:disabled:bg-white/[0.06] disabled:text-slate-400 dark:disabled:text-slate-600"
        >
          {adding ? <BubbleLoader size={18} /> : <><UserPlus size={14} /> Add</>}
        </button>
      </form>
      {error && <p className="text-[12px] text-red-500">{error}</p>}
    </div>
  );
}
