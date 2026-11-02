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

export const ROUTES = {
  home: '/',
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  oauthAuthorize: '/oauth/authorize',
  chat: (id: string) => `/chat/${encodeURIComponent(id)}`,
  settings: (tab: SettingsTab = 'profile') => (tab === 'profile' ? '/settings' : `/settings/${tab}`),
  newChat: '/new-chat',
  gifs: '/gifs',
  people: '/people',
  fantasy: '/fantasy',
  fantasyNew: '/fantasy/new',
  trash: '/trash',
} as const;

export const AUTH_ROUTES: string[] = [ROUTES.home, ROUTES.login, ROUTES.signup, ROUTES.forgotPassword];

export type AppRoute =
  | { kind: 'home' }
  | { kind: 'chat'; id: string }
  | { kind: 'settings'; tab: SettingsTab }
  | { kind: 'newChat' }
  | { kind: 'gifs' }
  | { kind: 'people' }
  | { kind: 'fantasy' }
  | { kind: 'fantasyNew' }
  | { kind: 'trash' };

export function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function parseAppRoute(path: string): AppRoute {
  const [head, ...rest] = path.split('/').filter(Boolean);
  switch (head) {
    case 'chat':
      return rest[0] ? { kind: 'chat', id: decodeURIComponent(rest[0]) } : { kind: 'home' };
    case 'settings': {
      const tab = (SETTINGS_TABS as readonly string[]).includes(rest[0]) ? (rest[0] as SettingsTab) : 'profile';
      return { kind: 'settings', tab };
    }
    case 'new-chat':
      return { kind: 'newChat' };
    case 'gifs':
      return { kind: 'gifs' };
    case 'people':
      return { kind: 'people' };
    case 'fantasy':
      return rest[0] === 'new' ? { kind: 'fantasyNew' } : { kind: 'fantasy' };
    case 'trash':
      return { kind: 'trash' };
    default:
      return { kind: 'home' };
  }
}

export function absoluteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}
