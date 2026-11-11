import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

export type FormField = {
  id: string;
  type: 'text' | 'choice' | 'rating';
  label: string;
  options?: string[];
  required: boolean;
};

export type FormData = {
  title: string;
  description: string;
  fields: FormField[];
};

type Props = {
  onSubmit: (data: FormData) => void;
  onClose: () => void;
};

export default function FormCreator({ onSubmit, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<FormField[]>([
    { id: Date.now().toString(), type: 'text', label: '', required: false },
  ]);

  function addField() {
    setFields(prev => [...prev, { id: Date.now().toString(), type: 'text', label: '', required: false }]);
  }

  function removeField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id));
  }

  function updateField(id: string, patch: Partial<FormField>) {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  function addChoiceOption(fieldId: string) {
    setFields(prev => prev.map(f =>
      f.id === fieldId ? { ...f, options: [...(f.options ?? []), ''] } : f
    ));
  }

  function updateChoiceOption(fieldId: string, i: number, val: string) {
    setFields(prev => prev.map(f =>
      f.id === fieldId
        ? { ...f, options: f.options?.map((o, idx) => idx === i ? val : o) }
        : f
    ));
  }

  function removeChoiceOption(fieldId: string, i: number) {
    setFields(prev => prev.map(f =>
      f.id === fieldId
        ? { ...f, options: f.options?.filter((_, idx) => idx !== i) }
        : f
    ));
  }

  function handleSubmit() {
    if (!title.trim() || fields.filter(f => f.label.trim()).length === 0) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      fields: fields.filter(f => f.label.trim()),
    });
  }

  const valid = title.trim() && fields.some(f => f.label.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
          <h2 className="text-slate-900 dark:text-white font-bold text-[16px]">Create Survey</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Survey Title</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Team lunch preferences"
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:border-sky-500/60 transition-all"
            />
          </div>

          <div>
            <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Description (optional)</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description..."
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 focus:outline-none focus:border-sky-500/60 transition-all"
            />
          </div>

          <div>
            <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Questions</label>
            <div className="space-y-3">
              {fields.map((field, i) => (
                <div key={field.id} className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400 flex-shrink-0 w-4">{i + 1}.</span>
                    <input
                      value={field.label}
                      onChange={e => updateField(field.id, { label: e.target.value })}
                      placeholder="Question..."
                      className="flex-1 bg-transparent text-slate-900 dark:text-white text-[13px] placeholder-slate-400 focus:outline-none"
                    />
                    <select
                      value={field.type}
                      onChange={e => updateField(field.id, {
                        type: e.target.value as FormField['type'],
                        options: e.target.value === 'choice' ? ['', ''] : undefined,
                      })}
                      className="text-[11px] bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 border-0 focus:outline-none"
                    >
                      <option value="text">Text</option>
                      <option value="choice">Choice</option>
                      <option value="rating">Rating</option>
                    </select>
                    {fields.length > 1 && (
                      <button onClick={() => removeField(field.id)} className="text-slate-400 hover:text-red-400 transition-colors flex-shrink-0">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {field.type === 'choice' && (
                    <div className="pl-6 space-y-1">
                      {(field.options ?? []).map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 flex-shrink-0" />
                          <input
                            value={opt}
                            onChange={e => updateChoiceOption(field.id, oi, e.target.value)}
                            placeholder={`Choice ${oi + 1}`}
                            className="flex-1 bg-transparent text-slate-800 dark:text-slate-200 text-[12px] placeholder-slate-400 focus:outline-none"
                          />
                          {(field.options?.length ?? 0) > 2 && (
                            <button onClick={() => removeChoiceOption(field.id, oi)} className="text-slate-400 hover:text-red-400 transition-colors">
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addChoiceOption(field.id)} className="text-sky-500 text-[11px] font-medium hover:text-sky-400 flex items-center gap-1 transition-colors mt-1">
                        <Plus size={11} /> Add choice
                      </button>
                    </div>
                  )}

                  {field.type === 'rating' && (
                    <div className="pl-6">
                      <p className="text-slate-400 text-[11px]">Respondents rate 1–5 stars</p>
                    </div>
                  )}

                  <div className="pl-6 flex items-center gap-2">
                    <div
                      onClick={() => updateField(field.id, { required: !field.required })}
                      className={`w-8 h-4 rounded-full transition-colors cursor-pointer relative flex-shrink-0 ${field.required ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${field.required ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-[11px] text-slate-500">Required</span>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={addField} className="flex items-center gap-1.5 mt-3 text-sky-500 text-[13px] font-medium hover:text-sky-400 transition-colors">
              <Plus size={14} /> Add question
            </button>
          </div>
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={handleSubmit}
            disabled={!valid}
            className="w-full py-3 bg-teal-500 hover:bg-teal-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold text-[14px] rounded-xl transition-all"
          >
            Send Survey
          </button>
        </div>
      </div>
    </div>
  );
}
