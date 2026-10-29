import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, Star, Check } from 'lucide-react';
import type { FormField } from './FormCreator';
import BubbleLoader from './BubbleLoader';

type Props = {
  formId: string;
  userId: string;
};

type FormData = {
  id: string;
  title: string;
  description: string | null;
  fields: FormField[];
  creator_id: string;
  is_active: boolean;
};

export default function FormMessage({ formId, userId }: Props) {
  const [form, setForm] = useState<FormData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [responseCount, setResponseCount] = useState(0);

  useEffect(() => {
    loadForm();
  }, [formId, userId]);

  async function loadForm() {
    const [{ data: formData }, { data: myResponse }, { count }] = await Promise.all([
      supabase.from('forms').select('*').eq('id', formId).maybeSingle(),
      supabase.from('form_responses').select('answers').eq('form_id', formId).eq('responder_id', userId).maybeSingle(),
      supabase.from('form_responses').select('*', { count: 'exact', head: true }).eq('form_id', formId),
    ]);
    if (formData) setForm(formData as FormData);
    if (myResponse) { setAnswers(myResponse.answers); setSubmitted(true); }
    setResponseCount(count ?? 0);
    setLoading(false);
  }

  async function handleSubmit() {
    if (!form || submitting) return;
    // Validate required fields
    for (const field of form.fields) {
      if (field.required && !answers[field.id]) return;
    }
    setSubmitting(true);
    await supabase.from('form_responses').upsert({
      form_id: formId,
      responder_id: userId,
      answers,
    }, { onConflict: 'form_id,responder_id' });
    setSubmitted(true);
    setResponseCount(c => c + 1);
    setSubmitting(false);
  }

  function updateAnswer(fieldId: string, value: string | string[] | number) {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  }

  if (loading) return <div className="my-2"><BubbleLoader size={28} /></div>;
  if (!form) return null;

  return (
    <div className="p-3 min-w-[240px] max-w-[300px] space-y-3">
      <div className="flex items-start gap-2">
        <FileText size={15} className="text-teal-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-white font-semibold text-[13px] leading-snug">{form.title}</p>
          {form.description && <p className="text-white/60 text-[11px] mt-0.5">{form.description}</p>}
        </div>
      </div>

      {submitted ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <div className="w-9 h-9 rounded-full bg-teal-500/20 flex items-center justify-center">
            <Check size={18} className="text-teal-400" />
          </div>
          <p className="text-white/70 text-[12px] font-medium">Response submitted</p>
          <p className="text-white/40 text-[10px]">{responseCount} response{responseCount !== 1 ? 's' : ''} so far</p>
        </div>
      ) : (
        <div className="space-y-3">
          {form.fields.map(field => (
            <div key={field.id} className="space-y-1.5">
              <label className="text-white/80 text-[12px] font-medium">
                {field.label}
                {field.required && <span className="text-red-400 ml-1">*</span>}
              </label>

              {field.type === 'text' && (
                <input
                  value={(answers[field.id] as string) ?? ''}
                  onChange={e => updateAnswer(field.id, e.target.value)}
                  placeholder="Your answer..."
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-[12px] placeholder-white/40 focus:outline-none focus:border-teal-400/60 transition-all"
                />
              )}

              {field.type === 'choice' && (
                <div className="space-y-1">
                  {(field.options ?? []).map((opt, oi) => {
                    const isSelected = answers[field.id] === opt;
                    return (
                      <button
                        key={oi}
                        onClick={() => updateAnswer(field.id, opt)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-[12px] transition-all border ${
                          isSelected
                            ? 'bg-teal-500/30 border-teal-400/50 text-white'
                            : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {field.type === 'rating' && (
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(star => (
                    <button
                      key={star}
                      onClick={() => updateAnswer(field.id, star)}
                      className="transition-all hover:scale-110"
                    >
                      <Star
                        size={20}
                        className={`transition-colors ${
                          (answers[field.id] as number ?? 0) >= star
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-white/30'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-semibold text-[12px] rounded-xl transition-all"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
}
