import { useState, useEffect } from 'react';
import { X, ExternalLink, Maximize2 } from 'lucide-react';

type Props = {
  latitude: number;
  longitude: number;
  label?: string;
  height?: number;
  className?: string;
  interactive?: boolean;
};

export function LocationMap({ latitude, longitude, label, height = 200, className = '', interactive = true }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  const embedUrl = `https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`;
  const navEmbedUrl = `https://www.google.com/maps?q=${latitude},${longitude}&z=14&output=embed`;

  return (
    <>
      <div className={`relative rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 ${className}`}>
        <iframe
          src={embedUrl}
          className="w-full pointer-events-none"
          style={{ height, border: 0 }}
          loading="lazy"
          title={label ?? 'Location'}
        />
        {interactive && (
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="absolute inset-0 cursor-pointer"
            aria-label="Open map fullscreen"
          />
        )}
        {interactive && (
          <div className="absolute top-2 right-2 flex gap-1.5">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm shadow-md flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-sky-500 transition-colors"
              title="Open in Google Maps"
            >
              <ExternalLink size={15} />
            </a>
            <button
              onClick={() => setFullscreen(true)}
              className="w-8 h-8 rounded-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm shadow-md flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-sky-500 transition-colors"
              title="Fullscreen"
            >
              <Maximize2 size={15} />
            </button>
          </div>
        )}
        {label && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
            <p className="text-white text-[12px] font-medium truncate">{label}</p>
          </div>
        )}
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[300] bg-slate-950 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-white/10 flex-shrink-0" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
                <Maximize2 size={16} className="text-sky-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-[15px]">Map</h2>
                {label && <p className="text-slate-400 text-[11px] truncate">{label}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 text-[13px] font-medium transition-all"
              >
                <ExternalLink size={14} />
                Open
              </a>
              <button
                onClick={() => setFullscreen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <iframe
            src={navEmbedUrl}
            className="w-full flex-1"
            style={{ border: 0 }}
            title="Fullscreen map"
          />
        </div>
      )}
    </>
  );
}

type PickerProps = {
  onPick: (lat: number, lng: number, label: string) => void;
  onClose: () => void;
};

export function LocationPicker({ onPick, onClose }: PickerProps) {
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      () => {
        setCoords({ lat: 37.7749, lng: -122.4194 });
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  function useCurrentLocation() {
    if (!navigator.geolocation) return;
    setSearching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLabel('Current location');
        setSearching(false);
      },
      () => setSearching(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleSend() {
    if (!coords) return;
    const finalLabel = label.trim() || 'Location';
    onPick(coords.lat, coords.lng, finalLabel);
  }

  const embedUrl = coords
    ? `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=15&output=embed`
    : '';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
          <h2 className="text-slate-900 dark:text-white font-bold text-lg">Share Location</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 text-sm">Getting your location...</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
                <iframe
                  src={embedUrl}
                  className="w-full pointer-events-none"
                  style={{ height: 220, border: 0 }}
                  loading="lazy"
                  title="Location preview"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={useCurrentLocation}
                  disabled={searching}
                  className="flex-1 py-2.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 dark:text-sky-400 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {searching ? <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /> : null}
                  Use my location
                </button>
              </div>

              <div className="bg-slate-100 dark:bg-white/5 rounded-xl px-4 py-3">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Label (optional)</label>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. Meet at Starbucks"
                  className="block w-full mt-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-500 text-[15px] focus:outline-none"
                />
              </div>

              <button
                onClick={handleSend}
                className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl transition-all"
              >
                Send Location
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
