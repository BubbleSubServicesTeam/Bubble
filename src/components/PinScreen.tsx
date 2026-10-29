import { useState, useEffect } from 'react';
import { useTheme, getLogoUrl } from '../lib/theme';
import { Delete, Fingerprint, ArrowLeft, KeyRound, LogOut } from 'lucide-react';
import BubbleLoader from './BubbleLoader';
import { BubbleKey } from './BubbleKey';
import KeyboardPassword from './KeyboardPassword';
import FingerprintScanner from './FingerprintScanner';
import { useAuth } from '../lib/auth';
import { getBiometricCapability } from '../lib/fingerprint';

type Props = {
  onUnlock: (pin: string) => Promise<boolean>;
  onUsePassword: (password: string) => Promise<boolean>;
  userName?: string;
  avatarUrl?: string;
  pinLength?: number;
  setupMode?: boolean;
  onSetupComplete?: (pin: string, length: number) => Promise<void>;
  title?: string;
  subtitle?: string;
};

export default function PinScreen({
  onUnlock, onUsePassword, userName, avatarUrl,
  pinLength = 4, setupMode = false, onSetupComplete,
  title, subtitle,
}: Props) {
  const { resolvedTheme } = useTheme();
  const { user, profile, unlockWithFingerprint, signOut } = useAuth();
  const [digits, setDigits] = useState<string[]>([]);
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

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  async function addDigit(d: string) {
    if (loading || digits.length >= pinLength) return;
    setError('');
    const next = [...digits, d];
    setDigits(next);

    if (next.length === pinLength) {
      setLoading(true);
      if (setupMode && onSetupComplete) {
        await onSetupComplete(next.join(''), pinLength);
        setSuccess(true);
        setLoading(false);
      } else {
        const ok = await onUnlock(next.join(''));
        if (!ok) {
          const newAttempts = attempts + 1;
          setAttempts(newAttempts);
          triggerShake();
          if (newAttempts >= 5) { setShowPasswordInput(true); return; }
          setError(`Incorrect PIN. ${5 - newAttempts} attempt${5 - newAttempts !== 1 ? 's' : ''} remaining.`);
          setDigits([]);
        }
        setLoading(false);
      }
    }
  }

  async function handlePasswordUnlock() {
    if (!password.trim()) return;
    setPasswordLoading(true);
    setPasswordError('');
    const ok = await onUsePassword(password);
    if (!ok) {
      setPasswordError('Incorrect password. Try again.');
      setPassword('');
    }
    setPasswordLoading(false);
  }

  function deleteDigit() {
    if (loading) return;
    setDigits(d => d.slice(0, -1));
    setError('');
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showPasswordInput || showFingerprint) return;
      if (e.key >= '0' && e.key <= '9') addDigit(e.key);
      else if (e.key === 'Backspace') deleteDigit();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPasswordInput, showFingerprint, digits.length, pinLength, loading, attempts]);

  const keys = ['1','2','3','4','5','6','7','8','9','','0','del'];

  const displayTitle = title ?? (setupMode ? 'Create a PIN' : 'Enter your PIN');
  const displaySubtitle = subtitle ?? (setupMode
    ? `Choose a ${pinLength}-digit PIN to protect your app`
    : 'Enter your PIN to continue');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] flex flex-col items-center justify-center p-6 transition-colors duration-300 relative overflow-hidden" style={{ position: 'fixed', inset: 0, WebkitOverflowScrolling: 'touch', overscrollBehavior: 'none' }}>
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
        className={`relative z-10 flex flex-col items-center gap-6 w-full max-w-[340px] ${shake ? '' : ''}`}
        style={shake ? { animation: 'pin-shake 0.5s ease-out' } : undefined}
      >
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2.5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-sky-500/20 shadow-2xl"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full bg-sky-500/15 flex items-center justify-center ring-4 ring-sky-500/20 shadow-2xl"
            >
              <img src={getLogoUrl(resolvedTheme)} alt="Bubble" className="w-10 h-10 rounded-full object-cover" />
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
                  setSuccess(true);
                  setError('');
                  // Keep the "Verified" state visible briefly before the lock screen closes
                  setTimeout(() => setShowFingerprint(false), 400);
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

        {loading && <BubbleLoader size={28} />}

        {/* ──── PASSWORD MODE: keypad hidden, full password UI ──── */}
        {showPasswordInput && !loading ? (
          <div className="w-full space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={16} className="text-sky-400" />
              <p className="text-slate-900 dark:text-white font-semibold text-[15px]">Enter Password</p>
            </div>
            <KeyboardPassword
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="Enter your password"
              onSubmit={handlePasswordUnlock}
            />
            {passwordError && (
              <p className="text-red-400 text-[13px] text-center">{passwordError}</p>
            )}
            <button
              onClick={handlePasswordUnlock}
              disabled={passwordLoading || !password.trim()}
              className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
            >
              {passwordLoading ? <BubbleLoader size={22} /> : 'Unlock'}
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

        {/* ──── PIN MODE: circular keypad ──── */}
        {!showPasswordInput && !showFingerprint && !loading && (
          <>
            {/* Soft glow behind keypad */}
            <div className="relative w-full">
              <div className="absolute inset-0 -inset-x-4 -inset-y-2 bg-sky-500/5 dark:bg-sky-500/[0.06] rounded-[2rem] blur-xl pointer-events-none" />
              <div className="relative grid grid-cols-3 gap-x-5 gap-y-4 w-full justify-items-center py-3">
                {keys.map((key, idx) => {
                  if (key === '') return <div key={idx} className="w-[68px] h-[68px]" />;
                  if (key === 'del') return (
                    <button
                      key={idx}
                      onClick={deleteDigit}
                      className="w-[68px] h-[68px] rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/[0.06] active:scale-90 transition-all"
                    >
                      <Delete size={22} />
                    </button>
                  );
                  return (
                    <BubbleKey
                      key={idx}
                      value={key}
                      onPress={() => addDigit(key)}
                      delay={idx * 0.15}
                      size={68}
                    />
                  );
                })}
              </div>
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
