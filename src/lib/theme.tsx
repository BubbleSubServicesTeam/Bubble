import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'auto';
type ResolvedTheme = 'light' | 'dark';

type ThemeCtx = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = 'bubble-theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'auto') return getSystemTheme();
  return theme;
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  // Default to dark mode; light only when the user explicitly chooses it
  return 'dark';
}

function applyThemeToDocument(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#020617' : '#f8fafc');
  }
  const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (appleMeta) {
    appleMeta.setAttribute('content', resolved === 'dark' ? 'black-translucent' : 'default');
  }
}

function updateFavicon(resolved: ResolvedTheme) {
  const icon = resolved === 'dark' ? '/3f47fddf-ea91-42a1-bb1d-b9ce5c6d6c83 copy copy copy.jpg' : '/grok-image-f587b157-0d4d-493c-95b9-11f95f3e5929.png';
  const iconType = resolved === 'dark' ? 'image/jpeg' : 'image/png';

  const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (favicon) {
    favicon.href = icon;
    favicon.setAttribute('type', iconType);
  }
  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (appleIcon) appleIcon.href = icon;
  const ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
  if (ogImage) ogImage.setAttribute('content', icon);
  const twitterImage = document.querySelector('meta[name="twitter:image"]') as HTMLMetaElement | null;
  if (twitterImage) twitterImage.setAttribute('content', icon);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getInitialTheme()));

  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyThemeToDocument(resolved);
    updateFavicon(resolved);
  }, [theme]);

  // Listen for system theme changes when in auto mode (with fallback for older iOS Safari)
  useEffect(() => {
    if (theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      applyThemeToDocument(resolved);
      updateFavicon(resolved);
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    const legacy = mq as any;
    legacy.addListener(handler);
    return () => legacy.removeListener(handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export function getLogoUrl(theme: ResolvedTheme): string {
  return theme === 'dark' ? '/3f47fddf-ea91-42a1-bb1d-b9ce5c6d6c83 copy copy copy.jpg' : '/grok-image-f587b157-0d4d-493c-95b9-11f95f3e5929.png';
}
