import { useEffect, useState } from 'react';
import { Check, Globe, Mail, ShieldCheck, UserCircle, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useTheme, getLogoUrl } from '../lib/theme';
import BubbleLoader from './BubbleLoader';

type ClientInfo = { name: string; website_url: string | null; redirect_uri_valid: boolean };

const ALLOWED_SCOPES = ['openid', 'profile', 'email'];
const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-provider`;

function readRequest() {
  const params = new URLSearchParams(window.location.search);
  const scopes = (params.get('scope') ?? '').split(' ').filter(scope => ALLOWED_SCOPES.includes(scope));
  return {
    clientId: params.get('client_id') ?? '',
    redirectUri: params.get('redirect_uri') ?? '',
    state: params.get('state'),
    scopes: scopes.length ? scopes : ALLOWED_SCOPES,
  };
}

function isClientInfo(value: unknown): value is ClientInfo {
  const info = value as ClientInfo | null;
  return !!info && typeof info.name === 'string' && typeof info.redirect_uri_valid === 'boolean';
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export default function OAuthAuthorizePage() {
  const { profile, user } = useAuth();
  const { resolvedTheme } = useTheme();
  const [request] = useState(readRequest);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(null);

  useEffect(() => {
    if (!request.clientId || !request.redirectUri) {
      setError('This sign-in link is incomplete. Go back to the app and try again.');
      setLoadingClient(false);
      return;
    }
    const query = new URLSearchParams({ client_id: request.clientId, redirect_uri: request.redirectUri });
    fetch(`${FUNCTION_URL}/client?${query}`)
      .then(async res => {
        const body: unknown = await res.json().catch(() => null);
        if (res.status === 404) {
          setError('This app is not registered with Bubble.');
          return;
        }
        if (!res.ok || !isClientInfo(body)) {
          setError('Could not load this sign-in request. Please try again.');
          return;
        }
        if (!body.redirect_uri_valid) {
          setError("This app's return address is not registered with Bubble, so sign-in was blocked.");
          return;
        }
        setClient(body);
      })
      .catch(() => setError('Could not reach Bubble. Check your connection and try again.'))
      .finally(() => setLoadingClient(false));
  }, [request.clientId, request.redirectUri]);

  function redirectBack(params: Record<string, string>) {
    const target = new URL(request.redirectUri);
    Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, value));
    if (request.state) target.searchParams.set('state', request.state);
    window.location.assign(target.toString());
  }

  async function approve() {
    setSubmitting('approve');
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');
      const res = await fetch(`${FUNCTION_URL}/authorize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: request.clientId, redirect_uri: request.redirectUri, scopes: request.scopes }),
      });
      const body: unknown = await res.json().catch(() => null);
      const code = (body as { code?: unknown } | null)?.code;
      if (!res.ok || typeof code !== 'string') throw new Error('Authorization failed');
      redirectBack({ code });
    } catch {
      setError('Sign-in could not be completed. Please try again.');
      setSubmitting(null);
    }
  }

  function deny() {
    setSubmitting('deny');
    redirectBack({ error: 'access_denied' });
  }

  const appHost = hostOf(client?.website_url ?? null);
  const accountName = profile?.display_name ?? user?.email ?? 'your account';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-3xl p-8 shadow-xl space-y-6">
        <div className="flex items-center gap-3">
          <img src={getLogoUrl(resolvedTheme)} alt="Bubble" className="w-9 h-9 rounded-xl" />
          <span className="text-slate-900 dark:text-white font-semibold text-[15px]">Sign in with Bubble</span>
        </div>

        {loadingClient && (
          <div className="flex justify-center py-8"><BubbleLoader size={28} /></div>
        )}

        {!loadingClient && error && (
          <div className="bg-red-500/[0.08] border border-red-500/[0.18] rounded-xl px-4 py-3">
            <p className="text-red-500 dark:text-red-400 text-[13px] leading-snug">{error}</p>
          </div>
        )}

        {!loadingClient && client && (
          <>
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center">
                <Globe size={22} className="text-sky-500" />
              </div>
              <h1 className="text-slate-900 dark:text-white font-semibold text-[20px] leading-tight">{client.name}</h1>
              <p className="text-slate-500 dark:text-slate-400 text-[14px]">
                {appHost ? `${appHost} wants to access your Bubble account.` : 'wants to access your Bubble account.'}
              </p>
            </div>

            <div className="bg-slate-100 dark:bg-white/[0.04] rounded-2xl p-4 space-y-3">
              <p className="text-slate-500 dark:text-slate-400 text-[12px] font-medium uppercase tracking-wide">This app will be able to see</p>
              <ul className="space-y-2.5 text-[14px] text-slate-800 dark:text-slate-200">
                <li className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-sky-500 flex-shrink-0" />Your Bubble user ID</li>
                {request.scopes.includes('profile') && (
                  <li className="flex items-center gap-2.5"><UserCircle size={16} className="text-sky-500 flex-shrink-0" />Your name and profile picture</li>
                )}
                {request.scopes.includes('email') && (
                  <li className="flex items-center gap-2.5"><Mail size={16} className="text-sky-500 flex-shrink-0" />Your email address</li>
                )}
              </ul>
            </div>

            <p className="text-slate-500 dark:text-slate-400 text-[13px]">
              Signed in as <span className="font-medium text-slate-800 dark:text-slate-200">{accountName}</span>
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={deny}
                disabled={submitting !== null}
                className="py-3 rounded-xl border border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-slate-200 font-semibold text-[14px] hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <X size={16} /> Deny
              </button>
              <button
                onClick={approve}
                disabled={submitting !== null}
                className="py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[14px] shadow-lg shadow-sky-500/20 disabled:bg-sky-500/30 transition-all flex items-center justify-center gap-2"
              >
                {submitting === 'approve' ? <BubbleLoader size={20} /> : <><Check size={16} /> Allow</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
