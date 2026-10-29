import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useTheme, getLogoUrl } from '../lib/theme';
import { Check, Lock, Shield, Zap, SkipForward } from 'lucide-react';
import PinScreen from './PinScreen';

type Props = { onComplete: () => void };

export default function PinSetupRequired({ onComplete }: Props) {
  const { setupPin, dismissPinSetup, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const [step, setStep] = useState<'intro' | 'choose_length' | 'enter' | 'confirm' | 'done'>('intro');
  const [pinLength, setPinLength] = useState(4);
  const [firstPin, setFirstPin] = useState('');

  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] flex flex-col items-center justify-center p-6 transition-colors duration-300 relative overflow-hidden">
        {/* Animated ambient orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[420px] h-[420px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-10 right-10 w-[200px] h-[200px] bg-blue-600/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 left-10 w-[160px] h-[160px] bg-cyan-500/6 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-7 w-full max-w-[360px]">
          {/* Logo + lock badge */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-[26px] overflow-hidden shadow-2xl ring-2 ring-sky-500/20">
                <img src={getLogoUrl(resolvedTheme)} alt="Bubble" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-2xl bg-sky-500 flex items-center justify-center shadow-xl ring-4 ring-slate-50 dark:ring-[#080c14]">
                <Lock size={16} className="text-white" />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-white text-[24px] font-bold tracking-tight">Welcome to Bubble</h1>
              <p className="text-slate-500 dark:text-slate-400 text-[14px] mt-1.5 leading-relaxed">
                Lock your chats behind a PIN for extra privacy, or skip and get started right away.
              </p>
            </div>
          </div>

          {/* Feature cards */}
          <div className="flex flex-col gap-2.5 w-full">
            <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06]">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center flex-shrink-0">
                <Shield size={16} className="text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 dark:text-white text-[13px] font-semibold leading-tight">PIN Lock</p>
                <p className="text-slate-500 dark:text-slate-400 text-[12px] leading-snug mt-0.5">Require a PIN each time you open the app</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/60 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06]">
              <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
                <Zap size={16} className="text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 dark:text-white text-[13px] font-semibold leading-tight">Quick Access</p>
                <p className="text-slate-500 dark:text-slate-400 text-[12px] leading-snug mt-0.5">Skip the PIN and jump straight into your chats</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5 w-full">
            <button
              onClick={() => setStep('choose_length')}
              className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Lock size={17} />
              Set up a PIN
            </button>
            <button
              onClick={() => { dismissPinSetup(); onComplete(); }}
              className="w-full py-3.5 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.10] text-slate-600 dark:text-slate-300 font-medium text-[14px] rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <SkipForward size={16} />
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'choose_length') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] flex flex-col items-center justify-center p-6 transition-colors duration-300 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[420px] h-[420px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-[340px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/15 flex items-center justify-center ring-4 ring-sky-500/20 shadow-2xl">
              <Lock size={26} className="text-sky-500" />
            </div>
            <h1 className="text-white text-[22px] font-bold">Choose your PIN length</h1>
            <p className="text-slate-500 dark:text-slate-400 text-[14px] text-center leading-relaxed">
              Longer PINs are more secure. You can change this later in Settings.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 w-full">
            {[4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => { setPinLength(n); setStep('enter'); }}
                className="relative group flex flex-col items-center gap-1.5 py-5 rounded-2xl border-2 border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] hover:border-sky-500/60 transition-all active:scale-95 overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-br from-sky-500/0 to-blue-500/0 group-hover:from-sky-500/8 group-hover:to-blue-500/8 transition-all duration-300" />
                <span className="relative text-slate-900 dark:text-white font-bold text-[20px] group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-colors">{n}</span>
                <span className="relative text-slate-500 dark:text-slate-400 text-[11px]">digits</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setStep('intro')}
            className="text-slate-500 hover:text-slate-300 text-[13px] font-medium transition-colors mt-1"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (step === 'enter') {
    return (
      <PinScreen
        key="enter"
        setupMode
        pinLength={pinLength}
        title="Create your PIN"
        subtitle={`Enter a ${pinLength}-digit PIN`}
        userName={profile?.display_name ?? undefined}
        avatarUrl={profile?.avatar_url}
        onSetupComplete={async (pin) => {
          setFirstPin(pin);
          setStep('confirm');
        }}
        onUnlock={async () => false}
        onUsePassword={() => {}}
      />
    );
  }

  if (step === 'confirm') {
    return (
      <PinScreen
        key="confirm"
        setupMode
        pinLength={pinLength}
        title="Confirm your PIN"
        subtitle="Enter it again to confirm"
        userName={profile?.display_name ?? undefined}
        avatarUrl={profile?.avatar_url}
        onSetupComplete={async (pin) => {
          if (pin !== firstPin) {
            setFirstPin('');
            setStep('enter');
            return;
          }
          await setupPin(pin, pinLength);
          setStep('done');
        }}
        onUnlock={async () => false}
        onUsePassword={() => {}}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] flex flex-col items-center justify-center p-6 transition-colors duration-300 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[420px] h-[420px] bg-green-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-5 max-w-[340px] text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center ring-4 ring-green-500/20 shadow-2xl">
          <Check size={36} className="text-green-400" />
        </div>
        <h1 className="text-white text-[22px] font-bold">PIN Set!</h1>
        <p className="text-slate-500 dark:text-slate-400 text-[14px] leading-relaxed">
          Your app is now protected. You'll enter this PIN every time you open Bubble.
        </p>
        <button
          onClick={() => { dismissPinSetup(); onComplete(); }}
          className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-sky-500/20 active:scale-[0.98]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
