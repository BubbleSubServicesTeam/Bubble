import { Bell } from 'lucide-react';
import { useAuth } from '../lib/auth';

type PrivacyRow = {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
};

export default function NotificationPrivacySettings() {
  const { profile, updateProfile } = useAuth();

  const rows: PrivacyRow[] = [
    {
      title: 'Show message text',
      description: 'When off, notifications say "New message" instead of the message itself.',
      checked: profile?.push_show_preview !== false,
      onToggle: () => updateProfile({ push_show_preview: profile?.push_show_preview === false }),
    },
    {
      title: 'Show sender name',
      description: 'When off, notifications show "Bubble" instead of who sent the message.',
      checked: profile?.push_show_sender !== false,
      onToggle: () => updateProfile({ push_show_sender: profile?.push_show_sender === false }),
    },
  ];

  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center flex-shrink-0">
          <Bell size={16} className="text-sky-500" />
        </div>
        <div>
          <p className="text-slate-900 dark:text-white font-semibold text-[14px] mb-1">Notification privacy</p>
          <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed">
            Control what appears on your lock screen when a push notification arrives.
          </p>
        </div>
      </div>

      {rows.map(row => (
        <div key={row.title} className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{row.title}</p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">{row.description}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={row.checked}
            aria-label={row.title}
            onClick={row.onToggle}
            className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 ${
              row.checked ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${
                row.checked ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      ))}
    </div>
  );
}
