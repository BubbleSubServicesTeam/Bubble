import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Copy, Check, KeyRound, Globe } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type OAuthClient = {
  id: string;
  client_id: string;
  name: string;
  redirect_uris: string[];
  scopes: string[];
  created_at: string;
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ClientIdsTab({ userId }: { userId: string }) {
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<{ clientId: string; secret: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('oauth_clients')
      .select('id, client_id, name, redirect_uris, scopes, created_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    setClients((data as OAuthClient[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [userId]);

  async function handleCreate() {
    if (!name.trim() || !redirectUri.trim()) { setError('Name and redirect URI are required.'); return; }
    setError(null);
    setCreating(true);

    const rawClientId = 'bub_client_' + Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('');
    const rawSecret = 'bub_secret_' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
    const secretHash = await sha256Hex(rawSecret);

    const { data, error: insertErr } = await supabase
      .from('oauth_clients')
      .insert({
        user_id: userId,
        client_id: rawClientId,
        client_secret_hash: secretHash,
        name: name.trim(),
        redirect_uris: [redirectUri.trim()],
      })
      .select('id, client_id, name, redirect_uris, scopes, created_at')
      .single();

    if (insertErr) {
      setError(insertErr.message);
      setCreating(false);
      return;
    }

    setClients(prev => [data as OAuthClient, ...prev]);
    setNewSecret({ clientId: rawClientId, secret: rawSecret });
    setName('');
    setRedirectUri('');
    setCreating(false);
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    await supabase.from('oauth_clients').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    setClients(prev => prev.filter(c => c.id !== id));
    setRevokingId(null);
  }

  async function copyValue(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <KeyRound size={16} className="text-sky-500" />
          <h3 className="text-slate-900 dark:text-white font-semibold text-[15px]">Client IDs</h3>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed">
          Create a Client ID and secret so other apps (like ChatGPT, Claude, or your own app) can let users sign in with their Bubble account. Use the OAuth endpoints below to implement "Sign in with Bubble."
        </p>
      </div>

      <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-[13px] font-medium text-slate-700 dark:text-slate-200">
          <Globe size={13} className="text-sky-500" />
          OAuth Endpoints
        </div>
        <div className="space-y-1 text-[12px] font-mono text-slate-500 dark:text-slate-400">
          <p>Authorize: POST /functions/v1/oauth-provider/authorize</p>
          <p>Token: POST /functions/v1/oauth-provider/token</p>
          <p>User Info: GET /functions/v1/oauth-provider/userinfo</p>
        </div>
      </div>

      {newSecret && (
        <div className="bg-green-500/[0.08] border border-green-500/25 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-green-400 text-[13px] font-semibold mb-1">Client created — save your secret now</p>
              <p className="text-slate-500 dark:text-slate-400 text-[12px]">You won't see the secret again. Copy it somewhere safe.</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/[0.05] rounded-xl px-3 py-2.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">Client ID</span>
              <code className="flex-1 text-slate-900 dark:text-white text-[12px] font-mono truncate">{newSecret.clientId}</code>
              <button onClick={() => copyValue(newSecret.clientId, 'cid')} className="flex-shrink-0 flex items-center gap-1 text-[12px] font-medium text-sky-500 hover:text-sky-400 px-2 py-1 rounded-lg transition-colors">
                {copiedField === 'cid' ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/[0.05] rounded-xl px-3 py-2.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">Secret</span>
              <code className="flex-1 text-slate-900 dark:text-white text-[12px] font-mono truncate">{newSecret.secret}</code>
              <button onClick={() => copyValue(newSecret.secret, 'secret')} className="flex-shrink-0 flex items-center gap-1 text-[12px] font-medium text-sky-500 hover:text-sky-400 px-2 py-1 rounded-lg transition-colors">
                {copiedField === 'secret' ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </div>
          <button onClick={() => setNewSecret(null)} className="w-full py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-600 dark:text-slate-300 font-medium text-[13px] rounded-xl transition-all">
            Done
          </button>
        </div>
      )}

      <div className="space-y-2">
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="App name (e.g. My ChatGPT bot)" maxLength={60}
          className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
        <input type="text" value={redirectUri} onChange={e => setRedirectUri(e.target.value)} placeholder="Redirect URI (e.g. https://myapp.com/callback)" maxLength={200}
          className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
        {error && <p className="text-red-500 text-[12px]">{error}</p>}
        <button onClick={handleCreate} disabled={creating}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white font-semibold text-[13px] rounded-xl transition-all shadow-lg shadow-sky-500/20">
          {creating ? <BubbleLoader size={16} /> : <Plus size={14} />}
          Create Client
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><BubbleLoader size={24} /></div>
      ) : clients.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-slate-400 text-[13px]">No Client IDs yet. Create one above to let users sign in with Bubble on your app.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map(c => (
            <div key={c.id} className="bg-slate-100 dark:bg-white/[0.04] rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                  <KeyRound size={14} className="text-sky-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 dark:text-white text-[13px] font-medium truncate">{c.name}</p>
                  <p className="text-slate-400 text-[11px] font-mono truncate">{c.client_id}</p>
                </div>
                <button onClick={() => handleRevoke(c.id)} disabled={revokingId === c.id}
                  className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition-all flex-shrink-0 disabled:opacity-50"
                  title="Revoke client">
                  {revokingId === c.id ? <BubbleLoader size={13} /> : <Trash2 size={14} />}
                </button>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate pl-11">{c.redirect_uris.join(', ')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
