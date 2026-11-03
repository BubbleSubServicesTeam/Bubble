import type { ContactVisibility } from '../lib/supabase';

const OPTIONS: { value: ContactVisibility; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'close_friends', label: 'Close friends' },
  { value: 'nobody', label: 'Nobody' },
];

type Props = {
  label: string;
  value: ContactVisibility;
  onChange: (value: ContactVisibility) => void;
};

export default function ContactVisibilityPicker({ label, value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <div role="radiogroup" aria-label={`Who can see ${label.toLowerCase()}`} className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
        {OPTIONS.map(option => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                selected
                  ? 'bg-white dark:bg-white/[0.12] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
