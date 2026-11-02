export const ROUTES = {
  home: '/',
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  oauthAuthorize: '/oauth/authorize',
} as const;

export const AUTH_ROUTES: string[] = [ROUTES.home, ROUTES.login, ROUTES.signup, ROUTES.forgotPassword];

export function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}
