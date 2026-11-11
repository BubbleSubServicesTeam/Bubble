import { useState, useEffect, useRef } from 'react';
import { Fingerprint, Check, X } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { collectTouchPattern, validatePatternQuality, type TouchPattern } from '../lib/fingerprint';

type Props = {
  /** Called with the collected touch pattern; return true to indicate success */
  onScanStart: (pattern: TouchPattern) => Promise<boolean>;
  onScanComplete: (success: boolean) => void;
  onCancel: () => void;
  label?: string;
};

type Phase = 'idle' | 'scanning' | 'rewinding' | 'success' | 'failed';
type FailReason = 'not_recognized' | 'poor_quality' | 'no_data';

export default function FingerprintScanner({ onScanStart, onScanComplete, onCancel, label }: Props) {
  const { resolvedTheme } = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [failReason, setFailReason] = useState<FailReason>('not_recognized');
  const [failMessage, setFailMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rewindRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const progressRef = useRef(0);
  const completedRef = useRef(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const collectRef = useRef<{ promise: Promise<TouchPattern>; cancel: () => void } | null>(null);
  const scanDuration = 5000;

  function startVisualHold() {
    if (phase === 'scanning' || phase === 'success') return;
    setPhase('scanning');
    setHolding(true);
    progressRef.current = 0;
    setProgress(0);
    completedRef.current = false;

    // Start collecting touch pattern from the scanner element
    if (scannerRef.current) {
      collectRef.current = collectTouchPattern(scannerRef.current, scanDuration);
    }

    const startTime = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / scanDuration) * 100);
      progressRef.current = pct;
      setProgress(pct);

      if (pct >= 100) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
        doBiometricCheck();
      }
    }, 30);
  }

  async function doBiometricCheck() {
    if (completedRef.current) return;
    completedRef.current = true;
    setHolding(false);

    try {
      let pattern: TouchPattern = { points: [], durationMs: 0, hash: '' };
      if (collectRef.current) {
        pattern = await collectRef.current.promise;
        collectRef.current = null;
      }

      if (!pattern.hash) {
        setFailReason('no_data');
        setFailMessage('Could not read your fingerprint. Try again.');
        setPhase('failed');
        setTimeout(() => setPhase('idle'), 2000);
        return;
      }

      // Validate touch quality — reject knuckles, nails, grazing, etc.
      const quality = validatePatternQuality(pattern);
      if (!quality.valid) {
        setFailReason('poor_quality');
        setFailMessage(quality.reason);
        setPhase('failed');
        setTimeout(() => setPhase('idle'), 2500);
        return;
      }

      const success = await onScanStart(pattern);
      if (success) {
        setPhase('success');
        setTimeout(() => onScanComplete(true), 1200);
      } else {
        setFailReason('not_recognized');
        setFailMessage('Fingerprint not recognized.');
        setPhase('failed');
        setTimeout(() => setPhase('idle'), 2000);
      }
    } catch {
      setFailReason('no_data');
      setFailMessage('Scan failed. Try again.');
      setPhase('failed');
      setTimeout(() => setPhase('idle'), 2000);
    }
  }

  function cancelVisualHold() {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (collectRef.current) {
      collectRef.current.cancel();
      collectRef.current = null;
    }
    setHolding(false);

    if (progressRef.current > 0 && !completedRef.current) {
      setPhase('rewinding');
      const startProgress = progressRef.current;
      const rewindStart = Date.now();
      const rewindDuration = 200;

      const animate = () => {
        const elapsed = Date.now() - rewindStart;
        const t = Math.min(1, elapsed / rewindDuration);
        const pct = startProgress * (1 - t);
        progressRef.current = pct;
        setProgress(pct);

        if (t < 1) {
          rewindRef.current = requestAnimationFrame(animate);
        } else {
          progressRef.current = 0;
          setProgress(0);
          setPhase('idle');
        }
      };
      rewindRef.current = requestAnimationFrame(animate);
    } else {
      progressRef.current = 0;
      setProgress(0);
      setPhase('idle');
    }
  }

  function handlePressStart() {
    if (rewindRef.current) {
      cancelAnimationFrame(rewindRef.current);
      rewindRef.current = null;
    }
    startVisualHold();
  }

  function handlePressEnd() {
    if (holding && phase === 'scanning' && !completedRef.current) {
      cancelVisualHold();
    }
  }

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
      if (rewindRef.current) cancelAnimationFrame(rewindRef.current);
      if (collectRef.current) collectRef.current.cancel();
    };
  }, []);

  const circumference = 2 * Math.PI * 52;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-5">
      <style>{`
        @keyframes fp-pulse-ring {
          0% { transform: scale(0.95); opacity: 0.7; }
          50% { transform: scale(1.15); opacity: 0.2; }
          100% { transform: scale(0.95); opacity: 0.7; }
        }
        @keyframes fp-glow {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.4)); }
          50% { filter: drop-shadow(0 0 16px rgba(56, 189, 248, 0.8)); }
        }
        @keyframes fp-ripple {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      {label && (
        <p className="text-slate-900 dark:text-white font-semibold text-[15px] text-center">{label}</p>
      )}

      {/* Scanner circle — touch target for pattern collection */}
      <div
        ref={scannerRef}
        className="relative w-[130px] h-[130px] flex items-center justify-center select-none"
        style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' }}
        onPointerDown={handlePressStart}
        onPointerUp={handlePressEnd}
        onPointerLeave={handlePressEnd}
        onContextMenu={e => e.preventDefault()}
      >
        {/* Pulsing ripple rings during scanning */}
        {phase === 'scanning' && (
          <>
            <div
              className="absolute inset-0 rounded-full border-2 pointer-events-none"
              style={{
                borderColor: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                animation: 'fp-ripple 2s ease-out infinite',
              }}
            />
            <div
              className="absolute inset-0 rounded-full border-2 pointer-events-none"
              style={{
                borderColor: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                animation: 'fp-ripple 2s ease-out infinite 0.7s',
              }}
            />
          </>
        )}

        {/* Progress ring (SVG) */}
        <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 120 120">
          <circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke={resolvedTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
            strokeWidth="2.5"
          />
          <circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke={
              phase === 'success' ? '#34d399'
              : phase === 'failed' ? '#f87171'
              : phase === 'rewinding' ? '#f59e0b'
              : '#38bdf8'
            }
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'none' }}
          />
        </svg>

        {/* Fingerprint icon */}
        <div
          className={`relative w-[80px] h-[80px] rounded-full flex items-center justify-center transition-all active:scale-95 pointer-events-none ${
            phase === 'idle' ? 'hover:scale-105' : ''
          } ${
            phase === 'scanning' ? 'cursor-wait'
            : phase === 'rewinding' ? 'cursor-wait'
            : phase === 'success' ? 'cursor-default'
            : 'cursor-pointer'
          }`}
          style={
            phase === 'scanning'
              ? { animation: 'fp-glow 1.5s ease-in-out infinite' }
              : phase === 'success'
              ? { filter: 'drop-shadow(0 0 12px rgba(52, 211, 153, 0.6))' }
              : undefined
          }
        >
          {phase === 'success' ? (
            <Check size={36} className="text-green-400" strokeWidth={2.5} />
          ) : phase === 'failed' ? (
            <X size={36} className="text-red-400" strokeWidth={2.5} />
          ) : (
            <Fingerprint
              size={40}
              className={
                phase === 'scanning' ? 'text-sky-400'
                : phase === 'rewinding' ? 'text-amber-400'
                : 'text-slate-600 dark:text-slate-300'
              }
              strokeWidth={1.5}
            />
          )}
        </div>
      </div>

      {/* Status text */}
      <div className="text-center min-h-[40px]">
        {phase === 'idle' && (
          <p className="text-slate-500 dark:text-slate-400 text-[13px]">
            Press and hold to scan
          </p>
        )}
        {phase === 'scanning' && (
          <p className="text-sky-400 text-[13px] font-medium">
            Hold steady... scanning
            <span className="ml-1 font-mono">{Math.round(progress)}%</span>
          </p>
        )}
        {phase === 'rewinding' && (
          <p className="text-amber-400 text-[13px] font-medium">Released — try again</p>
        )}
        {phase === 'success' && (
          <p className="text-green-400 text-[13px] font-medium">Fingerprint verified!</p>
        )}
        {phase === 'failed' && (
          <p className="text-red-400 text-[13px] font-medium">{failMessage || 'Fingerprint not recognized.'}</p>
        )}
      </div>

      {/* Cancel button */}
      {phase !== 'success' && (
        <button
          onClick={onCancel}
          className="text-slate-500 hover:text-slate-300 text-[13px] font-medium transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
