import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './auth';

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
  const icon = resolved === 'light' ? '/image copy 2.png' : '/image copy 3.png';
  const iconType = 'image/png';

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
  const { user, loading: authLoading } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getInitialTheme()));
  const [showThemeChoice, setShowThemeChoice] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem(STORAGE_KEY);
  });

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

  const chooseTheme = (next: Theme) => {
    setTheme(next);
    setShowThemeChoice(false);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme, setTheme }}>
      {children}
      {showThemeChoice && !authLoading && !user && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 p-5 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <img src={getLogoUrl(resolvedTheme)} alt="Bubble" className="mx-auto mb-5 h-24 w-24 rounded-3xl object-cover shadow-xl" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Choose your Bubble theme</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">You can change this anytime in Settings.</p>
            <div className="mt-6 grid grid-cols-3 gap-2">
              {([
                ['light', 'Light'],
                ['dark', 'Dark'],
                ['auto', 'Auto'],
              ] as const).map(([value, label]) => (
                <button key={value} onClick={() => chooseTheme(value)} className="rounded-2xl border border-slate-200 bg-slate-50 p-2 font-semibold text-slate-900 transition hover:border-sky-400 hover:bg-sky-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10">
                  <img src={value === 'light' ? '/image copy 2.png' : value === 'dark' ? '/image copy 3.png' : '/image copy.png'} alt={`${label} theme`} className="mb-2 h-16 w-full rounded-xl object-cover" />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export function getLogoUrl(theme: ResolvedTheme): string {
  return theme === 'light' ? '/image copy 2.png' : '/image copy 3.png';
}
