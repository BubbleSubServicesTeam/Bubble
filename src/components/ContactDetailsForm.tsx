import { useEffect, useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
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
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState<FormValues>(EMPTY_VALUES);
  const [draft, setDraft] = useState<FormValues>(EMPTY_VALUES);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const details = await fetchContactDetails(user.id, contactId);
        if (cancelled) return;
        const values: FormValues = {
          phone_number: details?.phone_number ?? '',
          address: details?.address ?? '',
          city: details?.city ?? '',
          state: details?.state ?? '',
          postal_code: details?.postal_code ?? '',
          country: details?.country ?? '',
        };
        setSaved(values);
        setDraft(values);
      } catch {
        if (!cancelled) setError("Couldn't load saved contact info.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, contactId]);

  function startEditing() {
    setDraft(saved);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    const normalized = Object.fromEntries(
      Object.entries(draft).map(([k, v]) => [k, v.trim()]),
    ) as FormValues;
    try {
      await saveContactDetails(
        user.id,
        contactId,
        Object.fromEntries(Object.entries(normalized).map(([k, v]) => [k, v || null])) as ContactDetails,
      );
      setSaved(normalized);
      setEditing(false);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const filled = CONTACT_DETAIL_FIELDS.filter(f => saved[f.key]);

  return (
    <div className="pt-2 border-t border-slate-200 dark:border-white/5">
      <div className="flex items-center justify-between py-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-[13px] font-medium text-slate-700 dark:text-slate-200"
        >
          <ChevronDown size={15} className={`text-slate-500 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
          Your contact info for {contactName}
        </button>
        {open && !editing && !loading && (
          <button
            type="button"
            onClick={startEditing}
            className="flex items-center gap-1 text-[12px] font-medium text-sky-500 hover:text-sky-400 transition-colors"
          >
            <Pencil size={12} />
            {filled.length === 0 ? 'Add info' : 'Edit'}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3 pb-1 animate-in fade-in duration-200">
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Only you can see this. Bubble also fills it in when {contactName} shares an address or phone number in chat.
          </p>

          {loading && <p className="text-[12px] text-slate-400">Loading...</p>}

          {!loading && !editing && (
            filled.length === 0 ? (
              <p className="text-[13px] text-slate-500 dark:text-slate-400">Nothing saved yet.</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
                {filled.map(f => (
                  <div key={f.key} className="contents">
                    <dt className="text-slate-500 dark:text-slate-400">{f.label}</dt>
                    <dd className="text-slate-800 dark:text-slate-100 break-words text-right">{saved[f.key]}</dd>
                  </div>
                ))}
              </dl>
            )
          )}

          {!loading && editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                {CONTACT_DETAIL_FIELDS.map(field => (
                  <label
                    key={field.key}
                    className={`space-y-1 ${field.key === 'address' || field.key === 'phone_number' ? 'col-span-2' : ''}`}
                  >
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{field.label}</span>
                    <input
                      value={draft[field.key]}
                      onChange={e => setDraft(d => ({ ...d, [field.key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-[12px] text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
