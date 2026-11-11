import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

export type PollData = {
  question: string;
  options: string[];
  allowsMultiple: boolean;
  maxChoices: number;
};

type Props = {
  onSubmit: (data: PollData) => void;
  onClose: () => void;
};

export default function PollCreator({ onSubmit, onClose }: Props) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  const [maxChoices, setMaxChoices] = useState(2);

  function addOption() {
    if (options.length >= 10) return;
    setOptions(prev => [...prev, '']);
  }

  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter((_, idx) => idx !== i));
    setMaxChoices(mc => Math.min(mc, options.length - 1));
  }

  function updateOption(i: number, val: string) {
    setOptions(prev => prev.map((o, idx) => idx === i ? val : o));
  }

  function handleSubmit() {
    const trimmed = options.map(o => o.trim()).filter(Boolean);
    if (!question.trim() || trimmed.length < 2) return;
    onSubmit({
      question: question.trim(),
      options: trimmed,
      allowsMultiple,
      maxChoices: allowsMultiple ? Math.min(maxChoices, trimmed.length) : 1,
    });
  }

  const valid = question.trim() && options.filter(o => o.trim()).length >= 2;
  const validOptionCount = options.filter(o => o.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
          <h2 className="text-slate-900 dark:text-white font-bold text-[16px]">Create Poll</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Question</label>
            <input
              autoFocus
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:border-sky-500/60 transition-all"
            />
          </div>

          <div>
            <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Options</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={e => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:border-sky-500/60 transition-all"
                  />
                  {options.length > 2 && (
                    <button onClick={() => removeOption(i)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button onClick={addOption} className="flex items-center gap-1.5 mt-2 text-sky-500 text-[13px] font-medium hover:text-sky-400 transition-colors">
                <Plus size={14} /> Add option
              </button>
            )}
          </div>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5">
            <div
              onClick={() => setAllowsMultiple(s => !s)}
              className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${allowsMultiple ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${allowsMultiple ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-slate-700 dark:text-slate-300 text-[13px] font-medium">Allow multiple choices</span>
          </label>

          {allowsMultiple && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5">
              <span className="text-slate-700 dark:text-slate-300 text-[13px] font-medium">Max choices per voter</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMaxChoices(mc => Math.max(2, mc - 1))}
                  disabled={maxChoices <= 2}
                  className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white text-sm font-bold flex items-center justify-center disabled:opacity-40"
                >−</button>
                <span className="text-slate-900 dark:text-white text-sm font-semibold w-5 text-center">{maxChoices}</span>
                <button
                  type="button"
                  onClick={() => setMaxChoices(mc => Math.min(validOptionCount, mc + 1))}
                  disabled={maxChoices >= validOptionCount || maxChoices >= 10}
                  className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white text-sm font-bold flex items-center justify-center disabled:opacity-40"
                >+</button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={handleSubmit}
            disabled={!valid}
            className="w-full py-3 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold text-[14px] rounded-xl transition-all"
          >
            Send Poll
          </button>
        </div>
      </div>
    </div>
  );
}
