import { useState, useEffect, useRef } from 'react';
import { Fingerprint, ArrowLeft, KeyRound, LogOut, Delete, Keyboard, Eye, EyeOff } from 'lucide-react';
import BubbleLoader from './BubbleLoader';
import KeyboardPassword from './KeyboardPassword';
import { useCaptureShield } from '../lib/captureShield';
import FingerprintScanner from './FingerprintScanner';
import { useAuth } from '../lib/auth';
import { getBiometricCapability } from '../lib/fingerprint';

type Props = {
  onUnlock: (pin: string) => Promise<boolean>;
  onUsePassword: (password: string) => Promise<boolean>;
  onConfirmUnlock: () => void;
  userName?: string;
  avatarUrl?: string;
  pinLength?: number;
  setupMode?: boolean;
  onSetupComplete?: (pin: string, length: number) => Promise<void>;
  title?: string;
  subtitle?: string;
};

export default function PinScreen({
  onUnlock, onUsePassword, onConfirmUnlock, userName, avatarUrl,
  pinLength = 4, setupMode = false, onSetupComplete,
  title, subtitle,
}: Props) {
  const { user, profile, pinLockedUntil, passwordLockedUntil, unlockWithFingerprint, signOut } = useAuth();
  const [digits, setDigits] = useState<string[]>([]);
  const digitsRef = useRef('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [success, setSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showFingerprint, setShowFingerprint] = useState(false);
  const [bioMode, setBioMode] = useState<'touch' | 'none'>('none');
  const [passwordKeyboardOpen, setPasswordKeyboardOpen] = useState(false);
  const [useNativeKeyboard, setUseNativeKeyboard] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [pinRemaining, setPinRemaining] = useState(0);
  const [passwordRemaining, setPasswordRemaining] = useState(0);
  const lockRemaining = showPasswordInput ? passwordRemaining : pinRemaining;
  const displayName = userName?.trim() || user?.email?.split('@')[0] || 'Bubble account';
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const avatarInitials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : displayName.slice(0, 2).toUpperCase();

  useEffect(() => {
    setAvatarFailed(false);
    setAvatarLoaded(false);
  }, [avatarUrl]);

  // Check biometric capability on mount
  useEffect(() => {
    getBiometricCapability().then(setBioMode);
  }, []);

  // Auto-show fingerprint scanner if unlock preference is 'fingerprint'
  const unlockPref = profile?.unlock_preference ?? 'pin';
  const fingerprintOnlyMode = !setupMode && unlockPref === 'fingerprint' && !!profile?.fingerprint_enabled && bioMode === 'touch';

  useEffect(() => {
    if (fingerprintOnlyMode) setShowFingerprint(true);
  }, [fingerprintOnlyMode]);

  // Fingerprint is available as an unlock option when:
  // - not in setup mode
  // - user has fingerprint_enabled turned on
  // - device has a touchscreen
  const fingerprintAvailable = !setupMode && !!profile?.fingerprint_enabled && bioMode === 'touch';

  useEffect(() => {
    const updateRemaining = () => {
      const pinLeft = pinLockedUntil ? Math.max(0, new Date(pinLockedUntil).getTime() - Date.now()) : 0;
      const passwordLeft = passwordLockedUntil ? Math.max(0, new Date(passwordLockedUntil).getTime() - Date.now()) : 0;
      setPinRemaining(pinLeft);
      setPasswordRemaining(passwordLeft);
      if (pinLeft === 0 && pinLockedUntil) setError('');
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [pinLockedUntil, passwordLockedUntil]);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  async function submitPin(pin: string) {
    setLoading(true);
    if (setupMode && onSetupComplete) {
      await onSetupComplete(pin, pinLength);
      setSuccess(true);
      setLoading(false);
    } else {
      const ok = await onUnlock(pin);
      if (ok) {
        onConfirmUnlock();
        return;
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        triggerShake();
        digitsRef.current = '';
        setDigits([]);
        if (newAttempts >= 5) {
          setError('Bubble is temporarily locked after too many incorrect attempts.');
        } else {
          setError(`Incorrect PIN. ${5 - newAttempts} attempt${5 - newAttempts !== 1 ? 's' : ''} remaining.`);
        }
      }
      setLoading(false);
    }
  }

  function handlePinChange(v: string) {
    if (loading || lockRemaining > 0 || success) return;
    const nums = v.replace(/\D/g, '').slice(0, pinLength);
    digitsRef.current = nums;
    setDigits(nums.split(''));
    setError('');
    if (nums.length === pinLength) void submitPin(nums);
  }

  function addDigit(d: string) {
    if (loading || lockRemaining > 0 || success) return;
    const nextValue = `${digitsRef.current}${d}`.slice(0, pinLength);
    digitsRef.current = nextValue;
    const next = nextValue.split('');
    setDigits(next);
    setError('');
    if (nextValue.length === pinLength) void submitPin(nextValue);
  }

  async function handlePasswordUnlock() {
    if (!password.trim() || passwordRemaining > 0) return;
    setPasswordLoading(true);
    setPasswordError('');
    const ok = await onUsePassword(password);
    if (ok) {
      onConfirmUnlock();
      return;
    } else {
      setPasswordError(passwordRemaining > 0 ? 'Password is temporarily locked after too many incorrect attempts.' : 'Incorrect password. Try again.');
      setPassword('');
    }
    setPasswordLoading(false);
  }

  function deleteDigit() {
    if (loading) return;
    digitsRef.current = digitsRef.current.slice(0, -1);
    setDigits(digitsRef.current.split(''));
    setError('');
  }

  // Blur any focused input/textarea when the PIN screen appears so
  // physical-keyboard digits don't leak into the chat text box underneath
  useEffect(() => {
    if (!showPasswordInput && !showFingerprint) {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        el.blur();
      }
    }
  }, [showPasswordInput, showFingerprint]);

  // The Bubble keyboard handles physical keys itself while open; only fall
  // back to this handler when it's dismissed.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showPasswordInput || showFingerprint) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        e.stopPropagation();
        handlePinChange(`${digitsRef.current}${e.key}`);
      }
      else if (e.key === 'Backspace') { e.preventDefault(); setDigits(d => d.slice(0, -1)); setError(''); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPasswordInput, showFingerprint, digits.length, pinLength, loading, attempts]);

  const captureHidden = useCaptureShield(3000);
  const compact = showPasswordInput && passwordKeyboardOpen;
  const avatarSize = compact ? 'w-14 h-14' : 'w-20 h-20';
  const displayTitle = title ?? (setupMode ? 'Create a PIN' : 'Enter your PIN');
  const displaySubtitle = subtitle ?? (setupMode
    ? `Choose a ${pinLength}-digit PIN to protect your app`
    : 'Enter your PIN to continue');

  return (
    <div className="flex flex-col items-center p-6 bg-slate-50 dark:bg-[#080c14] relative overflow-y-auto overscroll-contain" style={{ position: 'fixed', left: 0, right: 0, top: 0, height: 'calc(100dvh - var(--kbd-h, 0px))', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'none', scrollPaddingBottom: 24 }}>
      {/* Ambient glow — pulsing orbs */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[420px] h-[420px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none"
        style={{ animation: 'pin-orb-pulse 5s ease-in-out infinite' }}
      />
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-blue-600/8 rounded-full blur-3xl pointer-events-none"
        style={{ animation: 'pin-orb-pulse 6s ease-in-out infinite 1s' }}
      />

      <style>{`
        @keyframes pin-orb-pulse {
          0%, 100% { opacity: 0.6; transform: translate(-50%, 0) scale(1); }
          50% { opacity: 1; transform: translate(-50%, -10px) scale(1.08); }
        }
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-12px); }
          30% { transform: translateX(10px); }
          45% { transform: translateX(-8px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-4px); }
        }
        @keyframes pin-dot-fill {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.25); }
          100% { transform: scale(1.1); opacity: 1; }
        }
        @keyframes pin-success-burst {
          0% { transform: scale(1); }
          40% { transform: scale(1.35); }
          100% { transform: scale(1.1); }
        }
      `}</style>

      <div
        className={`relative z-10 my-auto flex flex-col items-center gap-6 w-full max-w-[340px] ${shake ? '' : ''}`}
        style={shake ? { animation: 'pin-shake 0.5s ease-out' } : undefined}
      >
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2.5">
          {avatarUrl && !avatarFailed ? (
            <div className={`relative ${avatarSize}`}>
              {!avatarLoaded && <div className="absolute inset-0 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse ring-4 ring-sky-500/10" />}
              <img
                src={avatarUrl}
                alt={displayName}
                draggable={false}
                onDragStart={e => e.preventDefault()}
                onContextMenu={e => e.preventDefault()}
                onLoad={() => setAvatarLoaded(true)}
                onError={() => { setAvatarFailed(true); setAvatarLoaded(false); }}
                style={{ WebkitTouchCallout: 'none' }}
                className={`${avatarSize} rounded-full object-cover ring-4 ring-sky-500/20 shadow-2xl select-none ${captureHidden ? 'opacity-0 transition-none' : `transition-opacity ${avatarLoaded ? 'opacity-100' : 'opacity-0'}`}`}
              />
            </div>
          ) : (
            <div className={`${avatarSize} rounded-full bg-gradient-to-br from-sky-500 via-cyan-500 to-blue-700 flex items-center justify-center ring-4 ring-sky-500/20 shadow-2xl`}>
              <span className="text-white text-xl font-bold tracking-wide">{avatarInitials}</span>
            </div>
          )}
          {userName && (
            <p className="text-slate-900 dark:text-white font-semibold text-[17px]">{userName}</p>
          )}
          <p className="text-slate-500 dark:text-slate-400 text-[14px]">
            {showFingerprint ? 'Fingerprint Unlock' : showPasswordInput ? 'Enter Password' : fingerprintOnlyMode ? 'Fingerprint Required' : displayTitle}
          </p>
          <p className="text-slate-400 dark:text-slate-500 text-[12px]">
            {showFingerprint ? 'Scan your fingerprint to continue' : showPasswordInput ? 'Enter your password to continue' : fingerprintOnlyMode ? 'Use your fingerprint to unlock' : displaySubtitle}
          </p>
        </div>

        {/* ──── FINGERPRINT MODE ──── */}
        {showFingerprint && !loading && (
          <div className="w-full py-2">
            <FingerprintScanner
              onScanStart={async (pattern) => {
                return await unlockWithFingerprint(pattern);
              }}
              onScanComplete={(success) => {
                if (success) {
                  onConfirmUnlock();
                } else {
                  setError('Fingerprint not recognized.');
                }
              }}
              onCancel={() => {
                // In fingerprint-only mode, don't allow going back to PIN
                if (!fingerprintOnlyMode) setShowFingerprint(false);
              }}
            />
            {error && (
              <p className="text-red-400 text-[13px] text-center mt-3">{error}</p>
            )}
            {!fingerprintOnlyMode && (
              <button
                onClick={() => { setShowFingerprint(false); setError(''); }}
                className="w-full flex items-center justify-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-300 transition-colors mt-4"
              >
                <ArrowLeft size={14} />
                Back to PIN
              </button>
            )}
            {fingerprintOnlyMode && (
              <button
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-1.5 text-[13px] text-slate-500 hover:text-red-400 transition-colors mt-4"
              >
                <LogOut size={14} />
                Log out
              </button>
            )}
          </div>
        )}

        {/* PIN dots — only show in PIN mode, not password or fingerprint mode */}
        {!showPasswordInput && !showFingerprint && (
          <div className="flex items-center gap-3.5 h-8">
            {Array.from({ length: pinLength }).map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-200 ${
                  success
                    ? 'bg-green-400 border-green-400'
                    : digits.length > i
                      ? 'bg-sky-400 border-sky-400'
                      : 'bg-transparent border-slate-300 dark:border-slate-600'
                } ${pinLength <= 4 ? 'w-4 h-4 border-2' : 'w-3 h-3 border'}`}
              />
            ))}
          </div>
        )}

        {error && !showPasswordInput && !showFingerprint && (
          <div className="bg-red-500/[0.08] border border-red-500/[0.18] rounded-xl px-4 py-2.5 w-full text-center">
            <p className="text-red-400 text-[13px]">{error}</p>
          </div>
        )}

        {lockRemaining > 0 && (
          <div className="bg-amber-500/[0.08] border border-amber-500/[0.2] rounded-xl px-4 py-3 w-full text-center">
            <p className="text-amber-400 text-[13px] font-medium">{showPasswordInput ? 'Password is temporarily locked' : 'PIN is temporarily locked'}</p>
            <p className="text-amber-300/80 text-[12px] mt-1">Try again in {Math.ceil(lockRemaining / 60000)} minute{Math.ceil(lockRemaining / 60000) === 1 ? '' : 's'}.</p>
          </div>
        )}
        {loading && <BubbleLoader size={28} className="pin-loader" />}

        {/* ──── PASSWORD MODE: keypad hidden, full password UI ──── */}
        {showPasswordInput && !loading ? (
          <div className="w-full space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={16} className="text-sky-400" />
              <p className="text-slate-900 dark:text-white font-semibold text-[15px]">Enter Password</p>
            </div>
            {useNativeKeyboard ? (
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handlePasswordUnlock(); }}
                  placeholder="Enter your password"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="off"
                  className="w-full h-[54px] bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 pr-11 text-slate-900 dark:text-white text-[15px] focus:outline-none focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            ) : (
              <KeyboardPassword
                label="Password"
                value={password}
                onChange={setPassword}
                placeholder="Enter your password"
                onSubmit={handlePasswordUnlock}
                active={passwordKeyboardOpen}
                onActivate={() => setPasswordKeyboardOpen(true)}
                onDismiss={() => setPasswordKeyboardOpen(false)}
              />
            )}
            {passwordError && (
              <p className="text-red-400 text-[13px] text-center">{passwordError}</p>
            )}
            <button
              onClick={handlePasswordUnlock}
              disabled={passwordLoading || passwordRemaining > 0 || !password.trim()}
              className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
            >
              {passwordLoading ? <BubbleLoader size={22} className="pin-loader" /> : 'Unlock'}
            </button>
            <button
              onClick={() => setUseNativeKeyboard(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-[13px] text-sky-500 hover:text-sky-400 transition-colors"
            >
              <Keyboard size={14} />
              {useNativeKeyboard ? 'Use Bubble keyboard' : 'Use phone keyboard'}
            </button>
            <button
              onClick={() => { setShowPasswordInput(false); setPassword(''); setPasswordError(''); }}
              className="w-full flex items-center justify-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft size={14} />
              Back to PIN
            </button>
          </div>
        ) : null}

        {/* ──── PIN MODE: Bubble keyboard (same as sign in / sign up / password) ──── */}
        {!showPasswordInput && !showFingerprint && !loading && (
          <>
            <div className="grid grid-cols-3 gap-4 w-full max-w-[320px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => addDigit(d)}
                  disabled={loading || lockRemaining > 0}
                  className="pin-key h-[72px] w-[72px] mx-auto aspect-square rounded-full bg-[#071a33] dark:bg-white shadow-lg shadow-[#071a33]/25 dark:shadow-black/10 text-white dark:text-slate-900 text-[26px] font-semibold active:scale-95 active:shadow-[0_0_0_12px_rgba(7,26,51,0.18)] dark:active:shadow-[0_0_0_12px_rgba(0,0,0,0.12)] active:bg-[#102d52] dark:active:bg-slate-100 hover:bg-[#102d52] dark:hover:bg-slate-50 transition-all disabled:opacity-40 border border-[#1d416d] dark:border-slate-200"
                >
                  {d}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => addDigit('0')}
                disabled={loading || lockRemaining > 0}
                className="pin-key h-[72px] w-[72px] mx-auto aspect-square rounded-full bg-[#071a33] dark:bg-white shadow-lg shadow-[#071a33]/25 dark:shadow-black/10 text-white dark:text-slate-900 text-[26px] font-semibold active:scale-95 active:shadow-[0_0_0_12px_rgba(7,26,51,0.18)] dark:active:shadow-[0_0_0_12px_rgba(0,0,0,0.12)] active:bg-[#102d52] dark:active:bg-slate-100 hover:bg-[#102d52] dark:hover:bg-slate-50 transition-all disabled:opacity-40 border border-[#1d416d] dark:border-slate-200"
              >
                0
              </button>
              <button
                type="button"
                onClick={deleteDigit}
                disabled={loading || lockRemaining > 0}
                className="pin-key h-[72px] w-[72px] mx-auto aspect-square rounded-full flex items-center justify-center bg-[#071a33] dark:bg-white text-slate-200 dark:text-slate-500 hover:bg-[#102d52] dark:hover:bg-slate-50 hover:text-white dark:hover:text-slate-700 active:scale-95 active:shadow-[0_0_0_12px_rgba(7,26,51,0.18)] dark:active:shadow-[0_0_0_12px_rgba(0,0,0,0.12)] transition-all disabled:opacity-40 border border-[#1d416d] dark:border-slate-200 shadow-lg shadow-[#071a33]/25 dark:shadow-black/10"
                title="Delete"
              >
                <Delete size={24} />
              </button>
            </div>

            {/* Unlock options: fingerprint + password + log out */}
            {!setupMode && (
              <div className="flex flex-col items-center gap-2.5 mt-1">
                <div className="flex items-center gap-4">
                  {fingerprintAvailable && (
                    <button
                      onClick={() => { setShowFingerprint(true); setError(''); }}
                      className="flex items-center gap-1.5 text-[13px] text-sky-500 hover:text-sky-400 transition-colors"
                    >
                      <Fingerprint size={14} />
                      Use fingerprint
                    </button>
                  )}
                  <button
                    onClick={() => setShowPasswordInput(true)}
                    className="flex items-center gap-1.5 text-[13px] text-sky-500 hover:text-sky-400 transition-colors"
                  >
                    <KeyRound size={14} />
                    Use password
                  </button>
                </div>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-red-400 transition-colors"
                >
                  <LogOut size={14} />
                  Log out
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
