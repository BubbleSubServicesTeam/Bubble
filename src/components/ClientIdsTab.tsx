import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Copy, Check, KeyRound, Globe, Link2, X, RotateCw } from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type OAuthClient = {
  id: string;
  client_id: string;
  name: string;
  website_url: string | null;
  redirect_uris: string[];
  scopes: string[];
  created_at: string;
};

type NewSecret = { clientId: string; secret: string; rotated: boolean };

const ISSUER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-provider`;

const SERVICE_ADDRESSES = [
  ['Issuer URL', ISSUER_URL, 'issuer'],
  ['Authorize URL', `${ISSUER_URL}/authorize`, 'authorize'],
  ['Token URL', `${ISSUER_URL}/token`, 'token'],
  ['User info URL', `${ISSUER_URL}/userinfo`, 'userinfo'],
] as const;

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function generateSecret(): string {
  return 'bub_secret_' + randomHex(32);
}

async function sha256Hex(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function isValidWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function buildCallbackUrl(website: string, path: string): string {
  const trimmedPath = path.trim();
  if (isValidWebUrl(trimmedPath)) return trimmedPath;
  return `${website.trim().replace(/\/$/, '')}/${trimmedPath.replace(/^\//, '')}`;
}

function buildSignInLink(clientId: string, redirectUri: string): string {
  const scopes = 'openid profile email chats.read chats.write';
  return `${window.location.origin}/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}`;
}

export default function ClientIdsTab({ userId }: { userId: string }) {
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState(() => window.location.origin);
  const [callbackPaths, setCallbackPaths] = useState(['/oauth/callback']);
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<NewSecret | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('oauth_clients')
      .select('id, client_id, name, website_url, redirect_uris, scopes, created_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    setClients((data as OAuthClient[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [userId]);

  async function handleCreate() {
    const website = (websiteUrl.trim() || window.location.origin).replace(/\/$/, '');
    const paths = callbackPaths.map(path => path.trim()).filter(Boolean).length > 0
      ? callbackPaths.map(path => path.trim()).filter(Boolean)
      : ['/oauth/callback'];
    if (!name.trim()) {
      setError('Enter an app name to create a Client ID.');
      return;
    }
    if (!isValidWebUrl(website)) {
      setError('Enter a complete website such as https://github.com.');
      return;
    }
    const redirectUris = paths.map(path => buildCallbackUrl(website, path));
    if (redirectUris.some(uri => !isValidWebUrl(uri))) {
      setError('Every callback sublink must be a valid web address or path.');
      return;
    }

    setError(null);
    setCreating(true);
    const clientId = 'bub_client_' + randomHex(12);
    const secret = generateSecret();
    const secretHash = await sha256Hex(secret);

    const { data, error: insertError } = await supabase
      .from('oauth_clients')
      .insert({ user_id: userId, client_id: clientId, client_secret_hash: secretHash, name: name.trim(), website_url: website, redirect_uris: redirectUris, scopes: ['openid', 'profile', 'email', 'chats.read', 'chats.write'] })
      .select('id, client_id, name, website_url, redirect_uris, scopes, created_at')
      .maybeSingle();

    if (insertError || !data) {
      setError('Could not create this Client ID. Check the details and try again.');
      setCreating(false);
      return;
    }

    setClients(prev => [data as OAuthClient, ...prev]);
    setNewSecret({ clientId, secret, rotated: false });
    setName('');
    setWebsiteUrl(window.location.origin);
    setCallbackPaths(['/oauth/callback']);
    setCreating(false);
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    await supabase.from('oauth_clients').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    setClients(prev => prev.filter(client => client.id !== id));
    setRevokingId(null);
  }

  async function handleRotate(client: OAuthClient) {
    if (!window.confirm(`Generate a new secret for "${client.name}"? The current secret will stop working immediately.`)) return;
    setRotatingId(client.id);
    setError(null);
    const secret = generateSecret();
    const { data, error: updateError } = await supabase
      .from('oauth_clients')
      .update({ client_secret_hash: await sha256Hex(secret) })
      .eq('id', client.id)
      .select('id')
      .maybeSingle();
    setRotatingId(null);
    if (updateError || !data) {
      setError('Could not rotate the secret. Try again.');
      return;
    }
    setNewSecret({ clientId: client.client_id, secret, rotated: true });
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
          Register an app's main website and exact callback sublinks so people can sign in with Bubble. For example, use https://github.com as the website and add /your-name/your-project/oauth/callback as a sublink.
        </p>
      </div>

      <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-[13px] font-medium text-slate-700 dark:text-slate-200"><Globe size={13} className="text-sky-500" /> Sign-in service addresses</div>
        {SERVICE_ADDRESSES.map(([label, value, field]) => (
          <div key={field} className="space-y-1">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <div className="flex items-center gap-2 bg-white dark:bg-white/[0.04] rounded-xl px-3 py-2">
              <code className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200 text-[12px] font-mono">{value}</code>
              <button onClick={() => copyValue(value, field)} className="text-sky-500 hover:text-sky-400 px-1.5 py-1 rounded-lg flex-shrink-0">{copiedField === field ? <Check size={12} /> : <Copy size={12} />}</button>
            </div>
          </div>
        ))}
      </div>

      {newSecret && (
        <div className="bg-green-500/[0.08] border border-green-500/25 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2.5"><Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" /><div><p className="text-green-400 text-[13px] font-semibold">{newSecret.rotated ? 'Secret rotated — save it now' : 'Client created — save your secret now'}</p><p className="text-slate-500 dark:text-slate-400 text-[12px] mt-1">The secret is shown only once.</p></div></div>
          {([['Client ID', newSecret.clientId, 'client'], ['Secret', newSecret.secret, 'secret']] as const).map(([label, value, field]) => (
            <div key={field} className="flex items-center gap-2 bg-slate-100 dark:bg-white/[0.05] rounded-xl px-3 py-2.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
              <code className="flex-1 text-slate-900 dark:text-white text-[12px] font-mono truncate">{value}</code>
              <button onClick={() => copyValue(value, field)} className="text-sky-500 hover:text-sky-400 px-2 py-1 rounded-lg">{copiedField === field ? <Check size={12} /> : <Copy size={12} />}</button>
            </div>
          ))}
          <button onClick={() => setNewSecret(null)} className="w-full py-2 bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 font-medium text-[13px] rounded-xl">Done</button>
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Register an app</p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">Name your app. Bubble creates the Client ID, secret, callback, and sign-in link automatically.</p>
        <input value={name} onChange={event => setName(event.target.value)} placeholder="App name (for example, GitHub project)" maxLength={60} className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
        <label className="space-y-1 block"><span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Main website <span className="font-normal text-slate-400">(optional)</span></span><input value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder={window.location.origin} maxLength={200} className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-sky-500/20" /></label>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Callback sublinks <span className="font-normal text-slate-400">(optional)</span></span><button type="button" onClick={() => setCallbackPaths(paths => [...paths, ''])} className="text-[12px] text-sky-500 hover:text-sky-400 flex items-center gap-1"><Plus size={13} /> Add sublink</button></div>
          {callbackPaths.map((path, index) => (
            <div key={index} className="flex items-center gap-2"><Link2 size={14} className="text-slate-400 flex-shrink-0" /><input value={path} onChange={event => setCallbackPaths(paths => paths.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="/your-name/your-project/oauth/callback" maxLength={200} className="flex-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-slate-900 dark:text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-500/20" />{callbackPaths.length > 1 && <button type="button" onClick={() => setCallbackPaths(paths => paths.filter((_, itemIndex) => itemIndex !== index))} className="text-slate-400 hover:text-red-400"><X size={15} /></button>}</div>
          ))}
          <p className="text-[11px] text-slate-500">The final links are exact matches. A path like /alice/project becomes https://github.com/alice/project/oauth/callback.</p>
        </div>
        {error && <p className="text-red-500 text-[12px]">{error}</p>}
        <button onClick={handleCreate} disabled={creating} className="flex items-center justify-center gap-1.5 w-full px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white font-semibold text-[13px] rounded-xl">{creating ? <BubbleLoader size={16} /> : <Plus size={14} />} Create Client ID</button>
      </div>

      {loading ? <div className="flex justify-center py-4"><BubbleLoader size={24} /></div> : clients.length === 0 ? <div className="text-center py-6"><p className="text-slate-400 text-[13px]">No Client IDs yet.</p></div> : <div className="space-y-2">{clients.map(client => <div key={client.id} className="bg-slate-100 dark:bg-white/[0.04] rounded-xl p-3 space-y-2"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center"><KeyRound size={14} className="text-sky-500" /></div><div className="flex-1 min-w-0"><p className="text-slate-900 dark:text-white text-[13px] font-medium truncate">{client.name}</p><div className="flex items-center gap-1.5 min-w-0"><p className="text-slate-400 text-[11px] font-mono truncate min-w-0">{client.client_id}</p><button onClick={() => copyValue(client.client_id, `client-${client.id}`)} className="text-sky-500 hover:text-sky-400 flex-shrink-0">{copiedField === `client-${client.id}` ? <Check size={11} /> : <Copy size={11} />}</button></div></div><button onClick={() => handleRotate(client)} disabled={rotatingId === client.id} className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-500 disabled:opacity-50" title="Rotate secret">{rotatingId === client.id ? <BubbleLoader size={13} /> : <RotateCw size={14} />}</button><button onClick={() => handleRevoke(client.id)} disabled={revokingId === client.id} className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 disabled:opacity-50" title="Revoke client">{revokingId === client.id ? <BubbleLoader size={13} /> : <Trash2 size={14} />}</button></div><p className="text-slate-500 dark:text-slate-400 text-[11px] truncate pl-11">{client.website_url}</p>{client.redirect_uris.map(uri => { const linkKey = `signin-${client.id}-${uri}`; return <div key={uri} className="flex items-center gap-2 pl-11"><p className="text-slate-500 dark:text-slate-400 text-[11px] truncate flex-1">{uri}</p><button onClick={() => copyValue(buildSignInLink(client.client_id, uri), linkKey)} className="text-sky-500 hover:text-sky-400 text-[11px] flex items-center gap-1 flex-shrink-0">{copiedField === linkKey ? <Check size={11} /> : <Copy size={11} />} Copy sign-in link</button></div>; })}</div>)}</div>}
    </div>
  );
}
