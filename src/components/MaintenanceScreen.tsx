import { Wrench } from 'lucide-react';
import { useTheme, getLogoUrl } from '../lib/theme';

type Props = {
  message: string;
  onAdminSignIn?: () => void;
};

export default function MaintenanceScreen({ message, onAdminSignIn }: Props) {
  const { resolvedTheme } = useTheme();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 transition-colors duration-300">
      <div className="w-full max-w-md flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-slate-200 dark:ring-white/10">
          <img src={getLogoUrl(resolvedTheme)} alt="Bubble" className="w-full h-full object-cover" />
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[12px] font-medium">
          <Wrench size={13} /> Maintenance
        </div>
        <div className="space-y-2">
          <h1 className="text-[22px] font-semibold text-slate-900 dark:text-white leading-[1.2]">We will be right back</h1>
          <p className="text-[14px] leading-[1.5] text-slate-600 dark:text-slate-400">{message}</p>
        </div>
        {onAdminSignIn && (
          <button
            onClick={onAdminSignIn}
            className="text-[12px] font-medium text-sky-600 dark:text-sky-400 hover:underline"
          >
            Admin sign in
          </button>
        )}
      </div>
    </div>
  );
}
