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
import OAuthAuthorizePage from './components/OAuthAuthorizePage';
import MaintenanceScreen from './components/MaintenanceScreen';
import { useMaintenanceStatus } from './lib/maintenance';
import { ROUTES, UNLOCK_RETURN_KEY, currentPath } from './lib/routes';

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

function initialAuthScreen(path: string): 'signin' | 'signup' | 'forgot' {
  if (path === ROUTES.signup) return 'signup';
  if (path === ROUTES.forgotPassword) return 'forgot';
  return 'signin';
}

function AppInner() {
  const { user, loading, profile, pinLocked, unlockWithPin, unlockWithPassword, lockApp } = useAuth();
  const { t } = useAppLang();
  const maintenance = useMaintenanceStatus();
  const [adminSignIn, setAdminSignIn] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const path = currentPath();

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

  useEffect(() => {
    if (user && (path === ROUTES.login || path === ROUTES.signup || path === ROUTES.forgotPassword)) {
      window.history.replaceState(null, '', ROUTES.home);
    }
  }, [user, path]);

  const hasLock = !!(profile?.pin_hash && profile?.pin_voluntary) || !!(profile?.fingerprint_enabled && (profile?.unlock_preference === 'fingerprint' || profile?.unlock_preference === 'both'));
  const pinLockActive = Boolean(user && pinLocked && hasLock);

  useEffect(() => {
    if (pinLockActive) {
      if (currentPath() === ROUTES.unlock) return;
      sessionStorage.setItem(UNLOCK_RETURN_KEY, window.location.pathname);
      window.history.replaceState(null, '', ROUTES.unlock);
    } else if (currentPath() === ROUTES.unlock) {
      const returnPath = sessionStorage.getItem(UNLOCK_RETURN_KEY) ?? ROUTES.home;
      sessionStorage.removeItem(UNLOCK_RETURN_KEY);
      window.history.replaceState(null, '', returnPath);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [pinLockActive]);

  if (!maintenance.loaded) return <LoadingScreen />;
  const isAdminSession = Boolean(user && profile?.is_admin);
  if (maintenance.enabled && !isAdminSession) {
    if (!user && !adminSignIn) {
      return <MaintenanceScreen message={maintenance.message} onAdminSignIn={() => setAdminSignIn(true)} />;
    }
    if (user && !profile) return <LoadingScreen />;
    if (user) return <MaintenanceScreen message={maintenance.message} />;
  }

  // Install prompt only for users who aren't logged in yet
  if (!user && !loading && isMobileBrowser() && !isRunningAsPWA() && !installDismissed) {
    return <InstallPrompt onContinue={() => setInstallDismissed(true)} />;
  }

  if (loading) return <LoadingScreen />;

  if (!user) return <AuthPage initialScreen={initialAuthScreen(path)} />;

  // Mount the chat app always (even behind PIN) so data preloads while typing
  const chatApp = (
    <NotificationProvider>
      <CallProvider>
        <ChatApp />
        <CallModal />
      </CallProvider>
    </NotificationProvider>
  );

  const pinOverlay = pinLockActive ? (
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

  if (pinLockActive) return pinOverlay;

  if (path === ROUTES.oauthAuthorize) {
    return (
      <>
        <OAuthAuthorizePage />
        {pinOverlay}
      </>
    );
  }

  return (
    <>
      {profile?.is_suspended && <SuspendedNotice />}
      {chatApp}
      {pinOverlay}
    </>
  );
}

function SuspendedNotice() {
  return (
    <div role="status" className="fixed top-0 inset-x-0 z-[9998] px-4 py-2 bg-amber-500 text-white text-center text-[12px] font-medium shadow-lg">
      Your account is suspended. You can view your chats and update your account info and security settings, but you cannot send messages.
    </div>
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
