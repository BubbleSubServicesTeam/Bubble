export const SETTINGS_TABS = [
  'profile',
  'appearance',
  'security',
  'language',
  'account',
  'paypal',
  'blocked',
  'apikeys',
  'clientids',
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const SETTINGS_SUBS = ['pin', 'password', 'email', 'fingerprint', 'delete'] as const;

export type SettingsSub = (typeof SETTINGS_SUBS)[number];

export const UNLOCK_RETURN_KEY = 'bubble-unlock-return';

export const ROUTES = {
  home: '/',
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  oauthAuthorize: '/oauth/authorize',
  unlock: '/unlock',
  chat: (id: string) => `/chat/${encodeURIComponent(id)}`,
  join: (token: string) => `/join/${encodeURIComponent(token)}`,
  settings: (tab: SettingsTab = 'profile', sub: SettingsSub | null = null) => {
    if (sub) return `/settings/${tab}/${sub}`;
    return `/settings/${tab}`;
  },
  newChat: '/new-chat',
  gifs: '/gifs',
  people: '/people',
  faceFilter: '/face-filters',
  trash: '/trash',
} as const;

export const AUTH_ROUTES: string[] = [ROUTES.home, ROUTES.login, ROUTES.signup, ROUTES.forgotPassword];

export type AppRoute =
  | { kind: 'home' }
  | { kind: 'chat'; id: string }
  | { kind: 'join'; token: string }
  | { kind: 'settings'; tab: SettingsTab; sub: SettingsSub | null }
  | { kind: 'newChat' }
  | { kind: 'gifs' }
  | { kind: 'people' }
  | { kind: 'faceFilter' }
  | { kind: 'trash' };

export function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function parseAppRoute(path: string): AppRoute {
  const [head, ...rest] = path.split('/').filter(Boolean);
  switch (head) {
    case 'chat':
      return rest[0] ? { kind: 'chat', id: decodeURIComponent(rest[0]) } : { kind: 'home' };
    case 'join':
      return rest[0] ? { kind: 'join', token: decodeURIComponent(rest[0]) } : { kind: 'home' };
    case 'settings': {
      const tab = (SETTINGS_TABS as readonly string[]).includes(rest[0]) ? (rest[0] as SettingsTab) : 'profile';
      const sub = (SETTINGS_SUBS as readonly string[]).includes(rest[1]) ? (rest[1] as SettingsSub) : null;
      return { kind: 'settings', tab, sub };
    }
    case 'new-chat':
      return { kind: 'newChat' };
    case 'gifs':
      return { kind: 'gifs' };
    case 'people':
      return { kind: 'people' };
    case 'face-filters':
      return { kind: 'faceFilter' };
    case 'trash':
      return { kind: 'trash' };
    default:
      return { kind: 'home' };
  }
}

export function absoluteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}
