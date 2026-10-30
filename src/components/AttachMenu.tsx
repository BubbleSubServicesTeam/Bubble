import { useRef, useState } from 'react';
import { Mic, Image, Link, BarChart2, Camera, DollarSign, X, FileText, Paperclip, Sparkles, MapPin } from 'lucide-react';

export type AttachOption =
  | 'file'
  | 'document'
  | 'voice'
  | 'iframe'
  | 'poll'
  | 'selfie'
  | 'money'
  | 'form'
  | 'gif'
  | 'location';

type Props = {
  onSelect: (option: AttachOption) => void;
  onClose: () => void;
  hasPayPal: boolean;
};

const OPTIONS: { key: AttachOption; icon: React.ReactNode; label: string; color: string }[] = [
  { key: 'file',      icon: <Image size={20} />,      label: 'Photo',         color: 'bg-blue-500' },
  { key: 'document',  icon: <Paperclip size={20} />,  label: 'Any File',      color: 'bg-indigo-500' },
  { key: 'voice',     icon: <Mic size={20} />,        label: 'Voice Memo',    color: 'bg-red-500' },
  { key: 'iframe',    icon: <Link size={20} />,       label: 'Embed / Link',  color: 'bg-purple-500' },
  { key: 'poll',      icon: <BarChart2 size={20} />,  label: 'Poll',          color: 'bg-orange-500' },
  { key: 'form',      icon: <FileText size={20} />,   label: 'Survey Form',   color: 'bg-teal-500' },
  { key: 'selfie',    icon: <Camera size={20} />,     label: 'Take Selfie',   color: 'bg-green-500' },
  { key: 'money',     icon: <DollarSign size={20} />, label: 'Send Money',    color: 'bg-emerald-500' },
  { key: 'gif',       icon: <Sparkles size={20} />,   label: 'GIF',          color: 'bg-sky-500' },
  { key: 'location',  icon: <MapPin size={20} />,     label: 'Location',     color: 'bg-rose-500' },
];

export default function AttachMenu({ onSelect, onClose, hasPayPal }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-auto bg-white dark:bg-slate-900 rounded-t-3xl p-5 pb-8 shadow-2xl border border-slate-200 dark:border-white/10 animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-slate-900 dark:text-white font-bold text-[16px]">Attach</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {OPTIONS.map(opt => {
            const disabled = opt.key === 'money' && !hasPayPal;
            return (
              <button
                key={opt.key}
                onClick={() => { if (!disabled) { onSelect(opt.key); } }}
                disabled={disabled}
                title={disabled ? 'Connect PayPal in Settings first' : undefined}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${
                  disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-slate-100 dark:hover:bg-white/5 active:scale-95'
                }`}
              >
                <div className={`w-12 h-12 rounded-2xl ${opt.color} flex items-center justify-center text-white shadow-lg`}>
                  {opt.icon}
                </div>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 text-center leading-tight">{opt.label}</span>
                {disabled && (
                  <span className="text-[9px] text-slate-400 text-center leading-tight">Needs PayPal</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
