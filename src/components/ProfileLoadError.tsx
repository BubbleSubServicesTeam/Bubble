import { RefreshCw, WifiOff } from 'lucide-react';
import { useTheme, getLogoUrl } from '../lib/theme';

type Props = {
  onRetry: () => void;
};

export default function ProfileLoadError({ onRetry }: Props) {
  const { resolvedTheme } = useTheme();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 transition-colors duration-300">
      <div className="w-full max-w-md flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-slate-200 dark:ring-white/10">
          <img src={getLogoUrl(resolvedTheme)} alt="Bubble" className="w-full h-full object-cover" />
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[12px] font-medium">
          <WifiOff size={13} /> Connection problem
        </div>
        <div className="space-y-2">
          <h1 className="text-[22px] font-semibold text-slate-900 dark:text-white leading-[1.2]">We could not load your account</h1>
          <p className="text-[14px] leading-[1.5] text-slate-600 dark:text-slate-400">
            You are still signed in. Check your connection and try again.
          </p>
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[14px] font-medium transition-colors"
        >
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    </div>
  );
}
