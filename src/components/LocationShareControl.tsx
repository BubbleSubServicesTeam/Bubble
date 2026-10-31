import { useEffect, useState } from 'react';
import { Check, Smartphone } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import {
  fetchViewerShare,
  saveCurrentLocation,
  setViewerAllowedDevices,
  setViewerShareEnabled,
} from '../lib/location';

type OwnDevice = { device_id: string; device_label: string | null };

type Props = { viewerId: string; viewerName: string };

export default function LocationShareControl({ viewerId, viewerName }: Props) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [devices, setDevices] = useState<OwnDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [share, devicesResult] = await Promise.all([
          fetchViewerShare(user.id, viewerId),
          supabase.from('user_device_locations').select('device_id, device_label').eq('user_id', user.id),
        ]);
        if (devicesResult.error) throw devicesResult.error;
        if (cancelled) return;
        setEnabled(share?.enabled ?? false);
        setAllowed(share?.allowedDeviceIds ?? null);
        setDevices((devicesResult.data ?? []) as OwnDevice[]);
      } catch {
        if (!cancelled) setError("Couldn't load location settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, viewerId]);

  const deviceIds = devices.map(d => d.device_id);
  const selected = allowed ?? deviceIds;

  async function run(action: () => Promise<void>, failMessage: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(failMessage);
    }
    setBusy(false);
  }

  async function toggleEnabled() {
    if (!user) return;
    const next = !enabled;
    await run(async () => {
      await setViewerShareEnabled(user.id, viewerId, next);
      setEnabled(next);
      if (next) {
        const saved = await saveCurrentLocation(user.id);
        if (!saved) setError('Sharing is on, but your location could not be read. Allow location access in your browser.');
      }
    }, 'Could not update sharing. Try again.');
  }

  async function toggleDevice(deviceId: string) {
    if (!user) return;
    const next = selected.includes(deviceId)
      ? selected.filter(id => id !== deviceId)
      : [...selected, deviceId];
    if (next.length === 0) {
      setError('Choose at least one device, or turn sharing off.');
      return;
    }
    const stored = next.length === deviceIds.length ? [] : next;
    await run(async () => {
      await setViewerAllowedDevices(user.id, viewerId, stored);
      setAllowed(stored.length > 0 ? stored : null);
    }, 'Could not update devices. Try again.');
  }

  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-900 dark:text-white font-medium text-[14px] truncate">{viewerName}</p>
          <p className="text-slate-500 dark:text-slate-400 text-[12px]">
            {enabled ? 'Can see your location' : 'Location hidden'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Share location with ${viewerName}`}
          onClick={toggleEnabled}
          disabled={loading || busy}
          className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 disabled:opacity-50 ${
            enabled ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <div
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${
              enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-white/[0.06]">
          <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Devices they can see</p>
          {devices.length === 0 ? (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Your devices appear here after one of them shares its location.
            </p>
          ) : (
            devices.map(device => {
              const on = selected.includes(device.device_id);
              return (
                <button
                  key={device.device_id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggleDevice(device.device_id)}
                  disabled={busy}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                >
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                    on ? 'bg-sky-500 border-sky-500' : 'border-slate-300 dark:border-white/20'
                  }`}>
                    {on && <Check size={12} className="text-white" />}
                  </span>
                  <Smartphone size={14} className="text-slate-500 flex-shrink-0" />
                  <span className="text-[13px] text-slate-700 dark:text-slate-200 truncate">
                    {device.device_label ?? device.device_id}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}

      {error && <p className="text-[12px] text-red-500">{error}</p>}
    </div>
  );
}
