import { useRef, useState } from 'react';
import { MessageSquarePlus, Phone, Upload, Check } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { parseWhatsAppText, extractExportText, runImport } from '../lib/whatsappImport';

type Props = { onOpenProfile: () => void; onImported: (conversationId: string) => void };

export default function WhatsAppImportCard({ onOpenProfile, onImported }: Props) {
  const { profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasPhone = !!(profile?.phone_number && profile.phone_number.trim().length > 0);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !hasPhone) return;
    setImporting(true);
    setError(null);
    setDone(null);
    try {
      const raw = await extractExportText(file);
      const parsed = parseWhatsAppText(raw);
      const result = await runImport(parsed);
      if ('error' in result) {
        setError(result.error);
      } else {
        setDone('Chat imported. The other person can continue this conversation when they join Bubble with the same phone number.');
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onImported(result.conversationId);
      }
    } catch (err: any) {
      setError(err?.message === 'No chat text file found in the zip'
        ? 'No chat text file found in that zip. Export the chat with media or without, and upload the file WhatsApp gives you.'
        : (err?.message ?? 'Import failed. Try again.'));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
          <MessageSquarePlus size={16} className="text-green-500" />
        </div>
        <div className="min-w-0">
          <p className="text-slate-900 dark:text-white font-semibold text-[14px] mb-1">Import from WhatsApp</p>
          <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed">
            Export a chat from WhatsApp, then upload the file here. Bubble matches the chat to the other person's phone number from the export.
          </p>
        </div>
      </div>

      {!hasPhone && (
        <div className="space-y-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <p className="text-[13px] text-amber-600 dark:text-amber-400 flex items-start gap-2">
            <Phone size={14} className="flex-shrink-0 mt-0.5" />
            Add your phone number in Contact Info before you can import WhatsApp chats.
          </p>
          <button
            type="button"
            onClick={onOpenProfile}
            className="text-[12px] font-semibold text-sky-500 hover:text-sky-400 transition-colors"
          >
            Go to Contact Info
          </button>
        </div>
      )}

      {hasPhone && (
        <form onSubmit={handleImport} className="space-y-2">
          <label
            htmlFor="whatsapp-import-file"
            className="flex items-center gap-2 w-full cursor-pointer bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] hover:border-sky-500/50 rounded-xl px-3 py-2.5 text-[13px] text-slate-600 dark:text-slate-400 transition-colors"
          >
            <Upload size={14} className="flex-shrink-0" />
            <span className="truncate">{file ? file.name : 'Choose .zip or .txt export file'}</span>
          </label>
          <input
            id="whatsapp-import-file"
            ref={fileInputRef}
            type="file"
            accept=".zip,.txt"
            className="hidden"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null); setDone(null); }}
          />
          <button
            type="submit"
            disabled={!file || importing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 text-white text-[13px] font-semibold transition-colors disabled:bg-slate-300 dark:disabled:bg-white/[0.06] disabled:text-slate-400 dark:disabled:text-slate-600"
          >
            {importing ? 'Importing…' : (<> <MessageSquarePlus size={14} /> Import from WhatsApp </>)}
          </button>
        </form>
      )}

      {done && (
        <p className="text-[12px] text-green-600 dark:text-green-400 flex items-start gap-1.5">
          <Check size={13} className="flex-shrink-0 mt-0.5" /> {done}
        </p>
      )}
      {error && <p className="text-[12px] text-red-500">{error}</p>}
    </div>
  );
}
