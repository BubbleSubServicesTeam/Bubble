import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  Plus, Trash2, Copy, Check, KeyRound, Server, Globe, Link2, X, RotateCw,
  Code2, BookOpen, ChevronRight, ExternalLink, ArrowRight, Zap, Shield, Terminal,
} from 'lucide-react';
import BubbleLoader from './BubbleLoader';

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  last_used_at: string | null;
  created_at: string;
};

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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const MCP_URL = new URL('/functions/v1/bubble-api/mcp', SUPABASE_URL).toString();
const OAUTH_ISSUER = `${SUPABASE_URL}/functions/v1/oauth-provider`;
const PREVIEW_URL = 'https://advanced-communicati-vwct.bolt.host/';

const SERVICE_ADDRESSES = [
  ['Issuer URL', OAUTH_ISSUER, 'issuer'],
  ['Authorize URL', `${OAUTH_ISSUER}/authorize`, 'authorize'],
  ['Token URL', `${OAUTH_ISSUER}/token`, 'token'],
  ['User info URL', `${OAUTH_ISSUER}/userinfo`, 'userinfo'],
] as const;

type SubTab = 'guide' | 'apikeys' | 'clientids';

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function generateSecret(): string {
  return 'bub_secret_' + randomHex(32);
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
  return `${PREVIEW_URL}oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}`;
}

function useCopy(timeout = 1500): [string | null, (value: string, field: string) => void] {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copy = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), timeout);
    } catch { /* clipboard unavailable */ }
  };
  return [copiedField, copy];
}

export default function DeveloperSettings({ userId }: { userId: string }) {
  const [subTab, setSubTab] = useState<SubTab>('guide');

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Code2 size={16} className="text-sky-500" />
          <h3 className="text-slate-900 dark:text-white font-semibold text-[15px]">Developer Settings</h3>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed">
          Connect external apps to Bubble using the MCP connector, API keys, and OAuth Client IDs.
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04]">
        {([
          ['guide', 'Setup Guide', BookOpen],
          ['apikeys', 'API Keys', KeyRound],
          ['clientids', 'Client IDs', Globe],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-medium transition-all ${
              subTab === key
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {subTab === 'guide' && <SetupGuide userId={userId} />}
      {subTab === 'apikeys' && <ApiKeysSection userId={userId} />}
      {subTab === 'clientids' && <ClientIdsSection userId={userId} />}
    </div>
  );
}

function SetupGuide({ userId }: { userId: string }) {
  const [step, setStep] = useState(0);
  const [copiedField, copy] = useCopy();
  const [mcpCopied, setMcpCopied] = useState(false);
  const [mcpCopyError, setMcpCopyError] = useState(false);

  async function copyMcpUrl() {
    setMcpCopyError(false);
    try {
      try {
        await navigator.clipboard.writeText(MCP_URL);
      } catch {
        const input = document.createElement('textarea');
        input.value = MCP_URL;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.focus();
        input.select();
        const ok = document.execCommand('copy');
        input.remove();
        if (!ok) throw new Error('Copy failed');
      }
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 1500);
    } catch {
      setMcpCopyError(true);
    }
  }

  const steps: { title: string; icon: typeof BookOpen; content: ReactNode }[] = [
    {
      title: 'Open your MCP-compatible app',
      icon: ExternalLink,
      content: (
        <div className="space-y-3">
          <p className="text-slate-600 dark:text-slate-300 text-[13px] leading-relaxed">
            Go to the app you want to connect to Bubble — for example, <span className="font-medium text-slate-900 dark:text-white">grok.com</span>. Open its <span className="font-medium text-slate-900 dark:text-white">Connect Apps</span> or integrations panel and look for an option like <span className="font-medium text-slate-900 dark:text-white">Add a custom connector</span> or <span className="font-medium text-slate-900 dark:text-white">Add MCP Server</span>.
          </p>
          <p className="text-slate-500 dark:text-slate-400 text-[12px] leading-relaxed">
            The exact wording varies by app, but you're looking for a form that asks for a Server URL and optionally OAuth credentials.
          </p>
        </div>
      ),
    },
    {
      title: 'Copy the Bubble MCP URL',
      icon: Server,
      content: (
        <div className="space-y-3">
          <p className="text-slate-600 dark:text-slate-300 text-[13px] leading-relaxed">
            In the form, the first field is the <span className="font-medium text-slate-900 dark:text-white">Server URL</span>. Copy the URL below and paste it there.
          </p>
          <div className="flex items-start gap-2 bg-white dark:bg-white/[0.06] rounded-xl px-3 py-2">
            <code title={MCP_URL} className="flex-1 min-w-0 break-all whitespace-normal text-slate-700 dark:text-slate-200 text-[11px] leading-relaxed font-mono">{MCP_URL}</code>
            <button
              type="button"
              onClick={copyMcpUrl}
              className="flex-shrink-0 flex items-center gap-1.5 text-[12px] font-medium text-sky-500 hover:text-sky-400 px-2 py-1 rounded-lg transition-colors"
            >
              {mcpCopied ? <Check size={12} /> : <Copy size={12} />}
              {mcpCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {mcpCopyError && <p className="text-red-500 text-[11px]">Copy was blocked by the browser. Select the URL above and copy it manually.</p>}
          <p className="text-slate-500 dark:text-slate-400 text-[12px] leading-relaxed">
            This URL points to Bubble's MCP endpoint. It lets the external app discover what Bubble can do — list conversations, read messages, and send messages.
          </p>
        </div>
      ),
    },
    {
      title: 'Create an API key (Bearer token)',
      icon: KeyRound,
      content: (
        <div className="space-y-3">
          <p className="text-slate-600 dark:text-slate-300 text-[13px] leading-relaxed">
            The MCP URL needs a <span className="font-medium text-slate-900 dark:text-white">Bearer token</span> to authenticate. That's a Bubble API key. Switch to the <span className="font-medium text-slate-900 dark:text-white">API Keys</span> tab above, create a key, and copy it.
          </p>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
            <p className="text-amber-600 dark:text-amber-400 text-[12px] leading-relaxed">
              The full key is shown only once. Save it somewhere safe before closing the dialog.
            </p>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-[12px] leading-relaxed">
            Back in your app's form, add an HTTP header:
          </p>
          <div className="rounded-xl bg-slate-100 dark:bg-white/[0.04] px-3 py-2.5 space-y-1">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Header name: <span className="font-mono text-slate-700 dark:text-slate-200">Authorization</span></p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Header value: <span className="font-mono text-slate-700 dark:text-slate-200">Bearer bub_your_key_here</span></p>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-[12px] leading-relaxed">
            Some apps (like Grok) may ask for this as <span className="font-medium">OAuth Credentials</span> instead of a header. If so, continue to the next steps.
          </p>
        </div>
      ),
    },
    {
      title: 'Create an OAuth Client ID (if required)',
      icon: Globe,
      content: (
        <div className="space-y-3">
          <p className="text-slate-600 dark:text-slate-300 text-[13px] leading-relaxed">
            If your app shows an <span className="font-medium text-slate-900 dark:text-white">OAuth Credentials Required</span> form, you'll need a Client ID and secret. Switch to the <span className="font-medium text-slate-900 dark:text-white">Client IDs</span> tab above, register your app, and copy the <span className="font-mono">bub_client_...</span> ID and <span className="font-mono">bub_secret_...</span> secret.
          </p>
          <p className="text-slate-500 dark:text-slate-400 text-[12px] leading-relaxed">
            Fill in the form in your app:
          </p>
          <div className="space-y-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] px-3 py-3">
            {([
              ['Client ID', 'bub_client_... (from the Client IDs tab)'],
              ['Client Secret', 'bub_secret_... (shown once when you create the client)'],
              ['Authorization Endpoint', `${OAUTH_ISSUER}/authorize`],
              ['Token Endpoint', `${OAUTH_ISSUER}/token`],
              ['Scopes', 'email'],
              ['Token Auth Method', 'none (PKCE only, recommended)'],
            ] as const).map(([label, value]) => (
              <div key={label} className="flex items-start gap-2">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex-shrink-0 w-40">{label}</span>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <code className="text-[11px] text-slate-700 dark:text-slate-200 font-mono break-all">{value}</code>
                  {label !== 'Scopes' && label !== 'Token Auth Method' && (
                    <button onClick={() => copy(value, `guide-${label}`)} className="text-sky-500 hover:text-sky-400 flex-shrink-0">
                      {copiedField === `guide-${label}` ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'Save and connect',
      icon: Zap,
      content: (
        <div className="space-y-3">
          <p className="text-slate-600 dark:text-slate-300 text-[13px] leading-relaxed">
            Click <span className="font-medium text-slate-900 dark:text-white">Save &amp; Connect</span> in your app. It will use the MCP URL (and OAuth credentials if required) to connect to Bubble.
          </p>
          <p className="text-slate-500 dark:text-slate-400 text-[12px] leading-relaxed">
            Once connected, your app can list your Bubble conversations, read messages, and send new messages — all through the MCP protocol.
          </p>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-3 py-3 space-y-1.5">
            <p className="text-sky-600 dark:text-sky-400 text-[12px] font-medium flex items-center gap-1.5">
              <Shield size={13} /> Security tips
            </p>
            <ul className="space-y-1 text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">
              <li className="flex items-start gap-1.5"><ChevronRight size={12} className="text-sky-400 flex-shrink-0 mt-0.5" /> Never share your API key or Client secret publicly.</li>
              <li className="flex items-start gap-1.5"><ChevronRight size={12} className="text-sky-400 flex-shrink-0 mt-0.5" /> Rotate secrets anytime from the Client IDs tab if a key is compromised.</li>
              <li className="flex items-start gap-1.5"><ChevronRight size={12} className="text-sky-400 flex-shrink-0 mt-0.5" /> Revoke keys or clients to immediately cut off access.</li>
            </ul>
          </div>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 px-1">
        {steps.map((_, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === step ? 'w-8 bg-sky-500' : i < step ? 'w-4 bg-sky-500/40' : 'w-4 bg-slate-200 dark:bg-white/[0.1]'
            }`}
            aria-label={`Step ${i + 1}`}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center flex-shrink-0">
            <Icon size={17} className="text-sky-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-slate-400 font-medium">Step {step + 1} of {steps.length}</p>
            <h4 className="text-slate-900 dark:text-white font-semibold text-[14px]">{current.title}</h4>
          </div>
        </div>
        {current.content}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          className="px-4 py-2.5 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Back
        </button>
        {!isLast ? (
          <button
            onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-sky-500 hover:bg-sky-400 transition-all shadow-lg shadow-sky-500/20"
          >
            Next <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={() => setStep(0)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-sky-500 hover:bg-sky-400 transition-all shadow-lg shadow-sky-500/20"
          >
            <RotateCw size={14} /> Start over
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] p-4 space-y-2">
        <div className="flex items-center gap-1.5">
          <Terminal size={13} className="text-slate-400" />
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quick reference</p>
        </div>
        <div className="space-y-1.5">
          {([
            ['MCP Server URL', MCP_URL, 'ref-mcp'],
            ['Authorize Endpoint', `${OAUTH_ISSUER}/authorize`, 'ref-authorize'],
            ['Token Endpoint', `${OAUTH_ISSUER}/token`, 'ref-token'],
          ] as const).map(([label, value, field]) => (
            <div key={field} className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-shrink-0 w-32">{label}</span>
              <code className="flex-1 min-w-0 truncate text-[11px] font-mono text-slate-700 dark:text-slate-200">{value}</code>
              <button onClick={() => copy(value, field)} className="text-sky-500 hover:text-sky-400 flex-shrink-0">
                {copiedField === field ? <Check size={11} /> : <Copy size={11} />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ApiKeysSection({ userId }: { userId: string }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedField, copy] = useCopy();
  const [mcpCopied, setMcpCopied] = useState(false);
  const [mcpCopyError, setMcpCopyError] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setCreating(true);
    const raw = 'bub_' + Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    const keyHash = await sha256Hex(raw);
    const { data, error: insertError } = await supabase
      .from('api_keys')
      .insert({ user_id: userId, name: name.trim() || 'My API Key', key_hash: keyHash, key_prefix: raw.slice(0, 8), permissions: ['read_messages', 'send_message'] })
      .select('id, name, key_prefix, permissions, last_used_at, created_at')
      .single();
    if (insertError || !data) {
      setError('Could not create this API key. Your account may be restricted.');
    } else {
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

  async function copyMcpUrl() {
    setMcpCopyError(false);
    try {
      try {
        await navigator.clipboard.writeText(MCP_URL);
      } catch {
        const input = document.createElement('textarea');
        input.value = MCP_URL;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.focus();
        input.select();
        const ok = document.execCommand('copy');
        input.remove();
        if (!ok) throw new Error('Copy failed');
      }
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 1500);
    } catch {
      setMcpCopyError(true);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Server size={16} className="text-sky-500" />
          <h4 className="text-slate-900 dark:text-white font-semibold text-[14px]">MCP connector</h4>
        </div>
        <p className="text-slate-600 dark:text-slate-300 text-[12px] leading-relaxed">
          Add this URL to Grok or another MCP-compatible app, then use a Bubble API key as its Bearer token.
        </p>
        <div className="flex items-start gap-2 bg-white dark:bg-white/[0.06] rounded-xl px-3 py-2">
          <code title={MCP_URL} className="flex-1 min-w-0 break-all whitespace-normal text-slate-700 dark:text-slate-200 text-[11px] leading-relaxed font-mono">{MCP_URL}</code>
          <button
            type="button"
            onClick={copyMcpUrl}
            className="flex-shrink-0 flex items-center gap-1.5 text-[12px] font-medium text-sky-500 hover:text-sky-400 px-2 py-1 rounded-lg transition-colors"
          >
            {mcpCopied ? <Check size={12} /> : <Copy size={12} />}
            {mcpCopied ? 'Copied' : 'Copy full URL'}
          </button>
        </div>
        {mcpCopyError && <p className="text-red-500 text-[11px]">Copy was blocked by the browser. Select the URL above and copy it manually.</p>}
        <p className="text-slate-500 dark:text-slate-400 text-[11px]">Use this URL with a Bubble API key as the Bearer token. New keys can list conversations, read messages, and send messages.</p>
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
              onClick={() => copy(newKey, 'newkey')}
              className="flex-shrink-0 flex items-center gap-1.5 text-[12px] font-medium text-sky-500 hover:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {copiedField === 'newkey' ? <Check size={12} /> : <Copy size={12} />}
              {copiedField === 'newkey' ? 'Copied' : 'Copy'}
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
        {error && <p className="text-red-500 text-[12px]">{error}</p>}
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

function ClientIdsSection({ userId }: { userId: string }) {
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState(PREVIEW_URL);
  const [callbackPaths, setCallbackPaths] = useState(['/oauth/callback']);
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<NewSecret | null>(null);
  const [copiedField, copy] = useCopy();
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
    const website = (websiteUrl.trim() || PREVIEW_URL).replace(/\/$/, '');
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
    setWebsiteUrl(PREVIEW_URL);
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

  return (
    <div className="space-y-5">
      <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-[13px] font-medium text-slate-700 dark:text-slate-200"><Globe size={13} className="text-sky-500" /> Sign-in service addresses</div>
        {SERVICE_ADDRESSES.map(([label, value, field]) => (
          <div key={field} className="space-y-1">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <div className="flex items-center gap-2 bg-white dark:bg-white/[0.04] rounded-xl px-3 py-2">
              <code className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200 text-[12px] font-mono">{value}</code>
              <button onClick={() => copy(value, field)} className="text-sky-500 hover:text-sky-400 px-1.5 py-1 rounded-lg flex-shrink-0">{copiedField === field ? <Check size={12} /> : <Copy size={12} />}</button>
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
              <button onClick={() => copy(value, field)} className="text-sky-500 hover:text-sky-400 px-2 py-1 rounded-lg">{copiedField === field ? <Check size={12} /> : <Copy size={12} />}</button>
            </div>
          ))}
          <button onClick={() => setNewSecret(null)} className="w-full py-2 bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 font-medium text-[13px] rounded-xl">Done</button>
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-white/[0.06] p-4">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Register an app</p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">Name your app. Bubble creates the Client ID, secret, callback, and sign-in link automatically.</p>
        <input value={name} onChange={event => setName(event.target.value)} placeholder="App name (for example, GitHub project)" maxLength={60} className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
        <label className="space-y-1 block"><span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Main website <span className="font-normal text-slate-400">(optional)</span></span><input value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder={PREVIEW_URL} maxLength={200} className="w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-sky-500/20" /></label>
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

      {loading ? <div className="flex justify-center py-4"><BubbleLoader size={24} /></div> : clients.length === 0 ? <div className="text-center py-6"><p className="text-slate-400 text-[13px]">No Client IDs yet.</p></div> : <div className="space-y-2">{clients.map(client => <div key={client.id} className="bg-slate-100 dark:bg-white/[0.04] rounded-xl p-3 space-y-2"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center"><KeyRound size={14} className="text-sky-500" /></div><div className="flex-1 min-w-0"><p className="text-slate-900 dark:text-white text-[13px] font-medium truncate">{client.name}</p><div className="flex items-center gap-1.5 min-w-0"><p className="text-slate-400 text-[11px] font-mono truncate min-w-0">{client.client_id}</p><button onClick={() => copy(client.client_id, `client-${client.id}`)} className="text-sky-500 hover:text-sky-400 flex-shrink-0">{copiedField === `client-${client.id}` ? <Check size={11} /> : <Copy size={11} />}</button></div></div><button onClick={() => handleRotate(client)} disabled={rotatingId === client.id} className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-500 disabled:opacity-50" title="Rotate secret">{rotatingId === client.id ? <BubbleLoader size={13} /> : <RotateCw size={14} />}</button><button onClick={() => handleRevoke(client.id)} disabled={revokingId === client.id} className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 disabled:opacity-50" title="Revoke client">{revokingId === client.id ? <BubbleLoader size={13} /> : <Trash2 size={14} />}</button></div><p className="text-slate-500 dark:text-slate-400 text-[11px] truncate pl-11">{client.website_url}</p>{client.redirect_uris.map(uri => { const linkKey = `signin-${client.id}-${uri}`; return <div key={uri} className="flex items-center gap-2 pl-11"><p className="text-slate-500 dark:text-slate-400 text-[11px] truncate flex-1">{uri}</p><button onClick={() => copy(buildSignInLink(client.client_id, uri), linkKey)} className="text-sky-500 hover:text-sky-400 text-[11px] flex items-center gap-1 flex-shrink-0">{copiedField === linkKey ? <Check size={11} /> : <Copy size={11} />} Copy sign-in link</button></div>; })}</div>)}</div>}
    </div>
  );
}
