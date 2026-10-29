import { useState } from 'react';
import { Smartphone, Share, Plus, Monitor, Chrome, Apple, Copy, Check, X } from 'lucide-react';
import { useTheme, getLogoUrl } from '../lib/theme';

export default function InstallPrompt({ onContinue }: { onContinue?: () => void }) {
  const { resolvedTheme } = useTheme();
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isMobile = isIOS || isAndroid;
  const isChromeOnIOS = /CriOS/.test(navigator.userAgent) && isIOS;
  const [copied, setCopied] = useState(false);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  function copyLink() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(appUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        fallbackCopy();
      });
    } else {
      fallbackCopy();
    }
  }

  function fallbackCopy() {
    const input = document.createElement('input');
    input.value = appUrl;
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
    document.body.removeChild(input);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 transition-colors duration-300 relative">
      {/* X dismiss button */}
      {onContinue && (
        <button
          onClick={onContinue}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-200/80 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-all z-10"
          title="Dismiss"
        >
          <X size={18} />
        </button>
      )}
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-2xl ring-2 ring-slate-200 dark:ring-white/10 mb-4">
            <img src={getLogoUrl(resolvedTheme)} alt="Bubble" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Bubble</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Chat, Call & GIFs</p>
        </div>

        {/* iPhone / iOS — Safari + Add to Home Screen with copyable link */}
        {isIOS && (
          <>
            {isChromeOnIOS && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 mb-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                  <Apple size={24} className="text-amber-500 dark:text-amber-400" />
                </div>
                <h2 className="text-slate-900 dark:text-white font-bold text-lg mb-1">Open in Safari</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                  Bubble needs Safari to install as an app on iPhone. Copy the link below and open it in Safari.
                </p>
              </div>
            )}

            {/* Copyable link box */}
            <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-4 mb-4">
              <p className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-2">App Link</p>
              <div className="flex items-center gap-2 bg-white dark:bg-white/[0.06] rounded-xl px-3 py-2.5 border border-slate-200 dark:border-white/10">
                <span className="flex-1 text-[13px] text-slate-700 dark:text-slate-300 truncate font-mono">{appUrl}</span>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-[12px] font-semibold transition-all active:scale-95 flex-shrink-0"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                  <Smartphone size={20} className="text-sky-500 dark:text-sky-400" />
                </div>
                <div>
                  <h2 className="text-slate-900 dark:text-white font-bold text-lg">Add Bubble to your Home Screen</h2>
                  <p className="text-slate-500 dark:text-slate-500 text-xs">It takes 10 seconds and works like a real app</p>
                </div>
              </div>

              <div className="space-y-4">
                <Step num={1} icon={<Apple size={16} className="text-slate-600 dark:text-slate-300" />} title="Open in Safari" desc="Copy the link above, open Safari, and paste it into the address bar." />
                <Step num={2} icon={<Share size={16} className="text-sky-500 dark:text-sky-400" />} title="Tap the Share button" desc="It's the square with an arrow at the bottom of the screen." />
                <Step num={3} icon={<Plus size={16} className="text-sky-500 dark:text-sky-400" />} title={`Tap "Add to Home Screen"`} desc="Bubble's icon will appear on your home screen like any app." />
                <Step num={4} icon={<Smartphone size={16} className="text-sky-500 dark:text-sky-400" />} title="Open from your home screen" desc="It opens full-screen, no browser bar — just like a downloaded app." />
              </div>
            </div>
          </>
        )}

        {/* Android */}
        {isAndroid && (
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                <Smartphone size={20} className="text-sky-500 dark:text-sky-400" />
              </div>
              <div>
                <h2 className="text-slate-900 dark:text-white font-bold text-lg">Install Bubble to continue</h2>
                <p className="text-slate-500 dark:text-slate-500 text-xs">Add it to your home screen — it takes 10 seconds</p>
              </div>
            </div>
            <div className="space-y-4">
              <Step num={1} icon={<Chrome size={16} className="text-slate-600 dark:text-slate-300" />} title="Open in Chrome" desc="Use Chrome for the best install experience." />
              <Step num={2} icon={<Plus size={16} className="text-sky-500 dark:text-sky-400" />} title={`Tap "Install app"`} desc={`Chrome shows a banner, or tap the menu (⋮) → "Add to Home screen" / "Install app".`} />
              <Step num={3} icon={<Smartphone size={16} className="text-sky-500 dark:text-sky-400" />} title="Open from your home screen" desc="It opens full-screen and shows up in Settings > Apps like any installed app." />
            </div>
          </div>
        )}

        {/* Desktop */}
        {!isMobile && (
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                <Smartphone size={20} className="text-sky-500 dark:text-sky-400" />
              </div>
              <div>
                <h2 className="text-slate-900 dark:text-white font-bold text-lg">Install Bubble to continue</h2>
                <p className="text-slate-500 dark:text-slate-500 text-xs">Add it to your home screen — it takes 10 seconds</p>
              </div>
            </div>
            <div className="space-y-4">
              <Step num={1} icon={<Monitor size={16} className="text-slate-600 dark:text-slate-300" />} title="Open in Chrome or Edge" desc="Look for the install icon in the address bar." />
              <Step num={2} icon={<Plus size={16} className="text-sky-500 dark:text-sky-400" />} title={`Click "Install"`} desc={`Or click the menu (⋮) → "Install Bubble".`} />
              <Step num={3} icon={<Monitor size={16} className="text-sky-500 dark:text-sky-400" />} title="Launch from your taskbar" desc="It installs like a real desktop app — its own window, pinned to Start menu and taskbar." />
            </div>
          </div>
        )}

        <p className="text-center text-slate-400 dark:text-slate-600 text-xs mt-6">
          Free · No app store · No developer account needed
        </p>

        {onContinue && (
          <button
            onClick={onContinue}
            className="w-full mt-4 py-3 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium text-[14px] rounded-xl transition-colors"
          >
            Continue in browser
          </button>
        )}
      </div>
    </div>
  );
}

function Step({ num, icon, title, desc }: { num: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500 dark:text-sky-400 text-xs font-bold">
        {num}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {icon}
          <p className="text-slate-900 dark:text-white font-semibold text-sm">{title}</p>
        </div>
        <p className="text-slate-500 dark:text-slate-500 text-xs leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
