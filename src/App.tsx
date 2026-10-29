import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { CallProvider } from './lib/calls';
import { ThemeProvider, useTheme, getLogoUrl } from './lib/theme';
import { AppLanguageProvider, useAppLang } from './lib/i18n';
import { NotificationProvider } from './lib/notifications';
import AuthPage from './components/AuthPage';
import ChatApp from './ChatApp';
import CallModal from './components/CallModal';
import InstallPrompt from './components/InstallPrompt';
import BubbleLoader from './components/BubbleLoader';
import PinScreen from './components/PinScreen';

function isRunningAsPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

function isMobileBrowser(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isChromeOnIOS(): boolean {
  return /CriOS/.test(navigator.userAgent) && /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function AppInner() {
  const { user, loading, profile, pinLocked, unlockWithPin, unlockWithPassword, lockApp } = useAuth();
  const { t } = useAppLang();
  const [installDismissed, setInstallDismissed] = useState(false);

  // Shift+Space manually locks the app if the user has a PIN set
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        if (user && profile?.pin_hash && profile?.pin_voluntary && !pinLocked) {
          lockApp();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user, profile, pinLocked, lockApp]);

  // Install prompt only for users who aren't logged in yet
  if (!user && !loading && isMobileBrowser() && !isRunningAsPWA() && !installDismissed) {
    return <InstallPrompt onContinue={() => setInstallDismissed(true)} />;
  }

  if (loading) return <LoadingScreen />;

  if (!user) return <AuthPage />;

  // Mount the chat app always (even behind PIN) so data preloads while typing
  const chatApp = (
    <NotificationProvider>
      <CallProvider>
        <ChatApp />
        <CallModal />
      </CallProvider>
    </NotificationProvider>
  );

  const hasLock = !!(profile?.pin_hash && profile?.pin_voluntary) || !!(profile?.fingerprint_enabled && (profile?.unlock_preference === 'fingerprint' || profile?.unlock_preference === 'both'));

  // Chat app stays mounted in the same tree position whether locked or not,
  // so unlocking the PIN returns you to your exact spot — nothing remounts.
  const pinOverlay = user && pinLocked && hasLock ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      <PinScreen
        onUnlock={unlockWithPin}
        onUsePassword={unlockWithPassword}
        userName={profile.display_name ?? undefined}
        avatarUrl={profile.avatar_url}
        pinLength={profile.pin_length ?? 4}
      />
    </div>
  ) : null;

  return (
    <>
      {chatApp}
      {pinOverlay}
    </>
  );
}

function LoadingScreen() {
  const { resolvedTheme } = useTheme();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center transition-colors duration-300">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-slate-200 dark:ring-white/10">
          <img src={getLogoUrl(resolvedTheme)} alt="Bubble" className="w-full h-full object-cover" />
        </div>
        <BubbleLoader size={36} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppLanguageProvider>
          <AppInner />
        </AppLanguageProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
