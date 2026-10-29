import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Copy, Check, KeyRound } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  last_used_at: string | null;
  created_at: string;
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ApiKeysTab({ userId }: { userId: string }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, permissions, last_used_at, created_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    setKeys((data as ApiKeyRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [userId]);

  async function handleCreate() {
    setCreating(true);
    const raw = 'bub_' + Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    const keyHash = await sha256Hex(raw);
    const { data, error } = await supabase
      .from('api_keys')
      .insert({ user_id: userId, name: name.trim() || 'My API Key', key_hash: keyHash, key_prefix: raw.slice(0, 8), permissions: ['send_message'] })
      .select('id, name, key_prefix, permissions, last_used_at, created_at')
      .single();
    if (!error && data) {
      setKeys(prev => [data as ApiKeyRow, ...prev]);
      setNewKey(raw);
      setName('');
    }
    setCreating(false);
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    await supabase.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    setKeys(prev => prev.filter(k => k.id !== id));
    setRevokingId(null);
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <KeyRound size={16} className="text-sky-500" />
          <h3 className="text-slate-900 dark:text-white font-semibold text-[15px]">API Keys</h3>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed">
          Create keys to let external apps and bots send messages as you. Keys start with <span className="font-mono">bub_</span> and are shown only once.
        </p>
      </div>

      {newKey && (
        <div className="bg-green-500/[0.08] border border-green-500/25 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-green-400 text-[13px] font-semibold mb-1">Key created — save it now</p>
              <p className="text-slate-500 dark:text-slate-400 text-[12px]">This is the only time you'll see the full key. Copy it somewhere safe.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/[0.05] rounded-xl px-3 py-2.5">
            <code className="flex-1 text-slate-900 dark:text-white text-[13px] font-mono truncate">{newKey}</code>
            <button
              onClick={copyKey}
              className="flex-shrink-0 flex items-center gap-1.5 text-[12px] font-medium text-sky-500 hover:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="w-full py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-600 dark:text-slate-300 font-medium text-[13px] rounded-xl transition-all"
          >
            Done
          </button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Key name (e.g. Discord bot)"
            maxLength={40}
            className="flex-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] focus:border-sky-500/60 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white font-semibold text-[13px] rounded-xl transition-all shadow-lg shadow-sky-500/20"
          >
            {creating ? <BubbleLoader size={16} /> : <Plus size={14} />}
            Create
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><BubbleLoader size={24} /></div>
      ) : keys.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-slate-400 text-[13px]">No API keys yet. Create one above to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className="flex items-center gap-3 bg-slate-100 dark:bg-white/[0.04] rounded-xl p-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                <KeyRound size={14} className="text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 dark:text-white text-[13px] font-medium truncate">{k.name}</p>
                <p className="text-slate-400 text-[11px] font-mono truncate">
                  {k.key_prefix}…
                  {k.last_used_at ? ` · used ${new Date(k.last_used_at).toLocaleDateString()}` : ' · never used'}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(k.id)}
                disabled={revokingId === k.id}
                className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition-all flex-shrink-0 disabled:opacity-50"
                title="Revoke key"
              >
                {revokingId === k.id ? <BubbleLoader size={13} /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
