import { useEffect, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  CONTACT_DETAIL_FIELDS,
  type ContactDetails,
  fetchContactDetails,
  saveContactDetails,
} from '../lib/contactDetails';

type Props = { contactId: string; contactName: string };

type FormValues = Record<keyof ContactDetails, string>;

const EMPTY_VALUES: FormValues = {
  phone_number: '',
  address: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
};

export default function ContactDetailsForm({ contactId, contactName }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const details = await fetchContactDetails(user.id, contactId);
        if (cancelled) return;
        setValues({
          phone_number: details?.phone_number ?? '',
          address: details?.address ?? '',
          city: details?.city ?? '',
          state: details?.state ?? '',
          postal_code: details?.postal_code ?? '',
          country: details?.country ?? '',
        });
      } catch {
        if (!cancelled) setError("Couldn't load saved contact info.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, contactId]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const patch = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v.trim() || null]),
    ) as ContactDetails;
    try {
      await saveContactDetails(user.id, contactId, patch);
      setSaved(true);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pt-2 border-t border-slate-200 dark:border-white/5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-2 text-[13px] font-medium text-slate-700 dark:text-slate-200"
      >
        <span>Your contact info for {contactName}</span>
        <ChevronDown size={15} className={`text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 pt-2 animate-in fade-in duration-200">
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Only you can see this. Bubble also fills it in when {contactName} shares an address or phone number in chat.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {CONTACT_DETAIL_FIELDS.map(field => (
              <label
                key={field.key}
                className={`space-y-1 ${field.key === 'address' || field.key === 'phone_number' ? 'col-span-2' : ''}`}
              >
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{field.label}</span>
                <input
                  value={values[field.key]}
                  disabled={loading}
                  onChange={e => { setSaved(false); setValues(v => ({ ...v, [field.key]: e.target.value })); }}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-50"
                />
              </label>
            ))}
          </div>

          {error && <p className="text-[12px] text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
                <Check size={13} /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saving}
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save contact info'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
