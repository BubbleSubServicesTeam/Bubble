import { X, Check } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  serviceName: string;
  description: string;
  permissions: string[];
  onAgree: () => void;
  onCancel: () => void;
  userEmail?: string;
};

function BubbleLogo() {
  return (
    <div className="w-14 h-14 rounded-2xl bg-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/30 flex-shrink-0">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="10" fill="white" opacity="0.25" />
        <circle cx="14" cy="14" r="6" fill="white" opacity="0.6" />
        <circle cx="14" cy="14" r="3" fill="white" />
      </svg>
    </div>
  );
}

function PayPalLogo() {
  return (
    <div className="w-14 h-14 rounded-2xl bg-[#0070ba] flex items-center justify-center shadow-lg shadow-[#0070ba]/30 flex-shrink-0">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <text x="4" y="21" fontSize="20" fontWeight="bold" fontStyle="italic" fill="white">P</text>
      </svg>
    </div>
  );
}

export default function ConsentDialog({ open, title, serviceName, description, permissions, onAgree, onCancel, userEmail }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/5">
          <p className="text-slate-400 dark:text-slate-500 text-[13px]">Authorization Request</p>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Logo connection row */}
          <div className="flex items-center justify-center gap-0">
            <BubbleLogo />
            {/* Connector line */}
            <div className="flex items-center gap-0 mx-1">
              <div className="w-6 h-px bg-slate-200 dark:bg-white/10" />
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow shadow-emerald-500/30">
                <Check size={10} className="text-white" strokeWidth={3} />
              </div>
              <div className="w-6 h-px bg-slate-200 dark:bg-white/10" />
            </div>
            <PayPalLogo />
          </div>

          {/* Title */}
          <div className="text-center">
            <h2 className="text-slate-900 dark:text-white font-bold text-[17px]">{title}</h2>
            {userEmail && (
              <p className="text-slate-500 dark:text-slate-400 text-[13px] mt-0.5">
                wants to access your <span className="font-semibold text-slate-700 dark:text-slate-300">{userEmail}</span> account
              </p>
            )}
          </div>

          {/* Permissions box */}
          <div className="border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
              <p className="text-slate-700 dark:text-slate-300 font-semibold text-[13px]">What Bubble can do:</p>
              <button className="text-sky-500 text-[11px] font-medium hover:underline">Learn more</button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {permissions.map((perm, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-white/40" />
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-[12px] leading-relaxed">{perm}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Not owned note */}
          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
            <span>Not owned or operated by PayPal</span>
            <span>·</span>
            <span>You can revoke access anytime</span>
          </div>

          {/* Buttons */}
          <div className="space-y-2">
            <button
              onClick={onAgree}
              className="w-full py-3 bg-[#0070ba] hover:bg-[#005ea6] text-white font-semibold text-[14px] rounded-xl transition-all"
            >
              Authorize Bubble
            </button>
            <button
              onClick={onCancel}
              className="w-full py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-medium text-[13px] rounded-xl transition-all"
            >
              Cancel
            </button>
          </div>

          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
            Authorizing will link your PayPal account to Bubble
          </p>
        </div>
      </div>
    </div>
  );
}
