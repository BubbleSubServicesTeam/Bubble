import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import LocationShareControl from './LocationShareControl';

type Viewer = { viewerId: string; name: string };

export default function LocationPrivacySettings() {
  const { user } = useAuth();
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: shares, error: shareError } = await supabase
        .from('location_shares')
        .select('viewer_id')
        .eq('granter_id', user.id);
      if (shareError) { if (!cancelled) setError(true); return; }

      const ids = (shares ?? []).map(s => s.viewer_id as string);
      let names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', ids);
        if (profileError) { if (!cancelled) setError(true); return; }
        names = new Map((profiles ?? []).map(p => [p.user_id as string, p.display_name as string]));
      }
      if (!cancelled) {
        setViewers(ids.map(id => ({ viewerId: id, name: names.get(id) ?? 'Contact' })));
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center flex-shrink-0">
          <MapPin size={16} className="text-sky-500" />
        </div>
        <div>
          <p className="text-slate-900 dark:text-white font-semibold text-[14px] mb-1">Location sharing</p>
          <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed">
            Choose which contacts can see where you are, and which of your devices each one can see.
            Open a contact's profile in chat to add them.
          </p>
        </div>
      </div>

      {error && <p className="text-[12px] text-red-500">Couldn't load your location sharing settings.</p>}
      {!error && viewers === null && <p className="text-[12px] text-slate-400">Loading...</p>}
      {viewers !== null && viewers.length === 0 && (
        <p className="text-[12px] text-slate-500 dark:text-slate-400">You are not sharing your location with anyone yet.</p>
      )}
      {viewers?.map(v => (
        <LocationShareControl key={v.viewerId} viewerId={v.viewerId} viewerName={v.name} />
      ))}
    </div>
  );
}
