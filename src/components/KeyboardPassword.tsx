import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Delete, Eye, EyeOff, ArrowUp, ArrowLeft, ArrowRight, CornerDownLeft as Return, Clipboard, ChevronDown } from 'lucide-react';

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  isEmail?: boolean;
  active?: boolean;
  onActivate?: () => void;
  onDismiss?: () => void;
};

const ROW1 = ['q','w','e','r','t','y','u','i','o','p'];
const ROW2 = ['a','s','d','f','g','h','j','k','l'];
const ROW3 = ['z','x','c','v','b','n','m'];

const NUM_ROW = ['1','2','3','4','5','6','7','8','9','0'];
const SYM_ROW1 = ['[',']','{','}','#','%','^','*','+','='];
const SYM_ROW2 = ['_','\\','|','~','<','>','€','£','¥','•'];
const SYM_ROW3 = ['.',',','?','!',"'",'"',';',':','@','&'];
const SYM_ROW4 = ['/','§','¶','°','·','©','®','™','✓','π'];

const ACCENTS: Record<string, string[]> = {
  a: ['à','á','â','ä','æ','ã','å','ā'],
  e: ['è','é','ê','ë','ē','ė','ę'],
  i: ['î','ï','í','ì','ī','į'],
  o: ['ô','ö','ò','ó','œ','ø','ō'],
  u: ['û','ü','ù','ú','ū'],
  c: ['ç','ć','č'],
  n: ['ñ','ń'],
  s: ['ß','ś','š'],
  y: ['ÿ'],
  z: ['ž','ź','ż'],
  l: ['ł'],
};

const BLINK_STYLE: React.CSSProperties = { animation: 'cursorBlink 1.1s steps(2) infinite' };

export default function KeyboardPassword({ label, value, onChange, placeholder, onSubmit, isEmail, active = true, onActivate, onDismiss }: Props) {
  const [show, setShow] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [shift, setShift] = useState(false);
  const [symMode, setSymMode] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [accentPopup, setAccentPopup] = useState<{ key: string; x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pressedKeyRef = useRef<string | null>(null);
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const kbdRef = useRef<HTMLDivElement>(null);

  // Cursor position within the text — characters are inserted/deleted at this position
  const [cursorPos, setCursorPos] = useState(value.length);
  const cursorPosRef = useRef(value.length);
  useEffect(() => { cursorPosRef.current = cursorPos; }, [cursorPos]);

  // When the field becomes active, place the cursor at the beginning
  useEffect(() => {
    if (active) {
      setCursorPos(0);
      cursorPosRef.current = 0;
    }
  }, [active]);

  // Keep cursor in bounds when value shrinks (e.g. parent clears the field)
  useEffect(() => {
    if (cursorPosRef.current > value.length) {
      const clamped = value.length;
      setCursorPos(clamped);
      cursorPosRef.current = clamped;
    }
  }, [value]);

  function moveCursorTo(pos: number) {
    const clamped = Math.max(0, Math.min(valueRef.current.length, pos));
    setCursorPos(clamped);
    cursorPosRef.current = clamped;
  }

  const [isLargeKeyboard, setIsLargeKeyboard] = useState(false);
  useEffect(() => {
    const checkSize = () => setIsLargeKeyboard(Math.min(window.innerWidth, window.innerHeight) >= 700);
    checkSize();
    window.addEventListener('resize', checkSize);
    window.addEventListener('orientationchange', checkSize);
    return () => {
      window.removeEventListener('resize', checkSize);
      window.removeEventListener('orientationchange', checkSize);
    };
  }, []);

  const backspaceRepeatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backspaceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startBackspaceRepeat() {
    handleBackspace();
    backspaceRepeatRef.current = setTimeout(() => {
      backspaceIntervalRef.current = setInterval(() => {
        handleBackspace();
      }, 50);
    }, 400);
  }

  function stopBackspaceRepeat() {
    if (backspaceRepeatRef.current) {
      clearTimeout(backspaceRepeatRef.current);
      backspaceRepeatRef.current = null;
    }
    if (backspaceIntervalRef.current) {
      clearInterval(backspaceIntervalRef.current);
      backspaceIntervalRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopBackspaceRepeat();
  }, []);

  function insertAtCursor(text: string) {
    const pos = cursorPosRef.current;
    const currentVal = valueRef.current;
    const newVal = currentVal.slice(0, pos) + text + currentVal.slice(pos);
    const newPos = pos + text.length;
    setCursorPos(newPos);
    cursorPosRef.current = newPos;
    onChange(newVal);
  }

  function handleKey(key: string) {
    let k = key;
    if (shift || capsLock) k = k.toUpperCase();
    if (shift) setShift(false);
    setActiveKey(k);
    setTimeout(() => setActiveKey(null), 120);
    insertAtCursor(k);
  }

  function handleBackspace(highlight = true) {
    if (highlight) {
      setActiveKey('backspace');
      setTimeout(() => setActiveKey(null), 120);
    }
    const pos = cursorPosRef.current;
    if (pos <= 0) return;
    const currentVal = valueRef.current;
    const newVal = currentVal.slice(0, pos - 1) + currentVal.slice(pos);
    const newPos = pos - 1;
    setCursorPos(newPos);
    cursorPosRef.current = newPos;
    onChange(newVal);
  }

  function handleSpace(highlight = true) {
    if (highlight) {
      setActiveKey('space');
      setTimeout(() => setActiveKey(null), 120);
    }
    insertAtCursor(' ');
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!active) return;
    if (e.metaKey || e.ctrlKey) return;
    if (e.key === 'Backspace') { e.preventDefault(); handleBackspace(false); }
    else if (e.key === 'Enter') { e.preventDefault(); onSubmit?.(); }
    else if (e.key === ' ') { e.preventDefault(); handleSpace(false); }
    else if (e.key === 'Shift') { setShift(s => !s); }
    else if (e.key === 'CapsLock') { setCapsLock(c => !c); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); moveCursorTo(cursorPosRef.current - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveCursorTo(cursorPosRef.current + 1); }
    else if (e.key === 'Home') { e.preventDefault(); moveCursorTo(0); }
    else if (e.key === 'End') { e.preventDefault(); moveCursorTo(valueRef.current.length); }
    else if (e.key.length === 1) {
      e.preventDefault();
      let k = e.key;
      if (shift || capsLock) k = k.toUpperCase();
      if (shift) setShift(false);
      insertAtCursor(k);
    }
  }

  useEffect(() => {
    if (active) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  });

  useEffect(() => {
    if (!active) return;
    containerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || kbdRef.current?.contains(t)) return;
      onDismiss?.();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [active, onDismiss]);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) insertAtCursor(text);
    } catch { /* clipboard unavailable */ }
  }

  function startLongPress(k: string, btnEl: HTMLButtonElement | null) {
    if (!ACCENTS[k]) return;
    if (!btnEl) return;
    const rect = btnEl.getBoundingClientRect();
    longPressTimerRef.current = setTimeout(() => {
      setAccentPopup({ key: k, x: rect.left + rect.width / 2, y: rect.top });
    }, 400);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function selectAccent(accent: string) {
    let c = accent;
    if (shift || capsLock) c = c.toUpperCase();
    insertAtCursor(c);
    setAccentPopup(null);
    cancelLongPress();
  }

  function handleKeyPointerDown(k: string, btnEl: HTMLButtonElement | null) {
    pressedKeyRef.current = k;
    startLongPress(k, btnEl);
  }

  function handleKeyPointerUp(k: string) {
    cancelLongPress();
    if (accentPopup) {
      pressedKeyRef.current = null;
      return;
    }
    if (pressedKeyRef.current === k) {
      handleKey(k);
    }
    pressedKeyRef.current = null;
  }

  function handleKeyPointerLeave() {
    cancelLongPress();
    pressedKeyRef.current = null;
  }

  const displayValue = (isEmail || show) ? value : '•'.repeat(value.length);

  const row1 = (shift || capsLock) ? ROW1.map(k => k.toUpperCase()) : ROW1;
  const row2 = (shift || capsLock) ? ROW2.map(k => k.toUpperCase()) : ROW2;
  const row3 = (shift || capsLock) ? ROW3.map(k => k.toUpperCase()) : ROW3;

  function keyBtn(k: string) {
    const lowerK = k.toLowerCase();
    const isHighlighted = activeKey === k || activeKey === lowerK;
    const ref = (el: HTMLButtonElement | null) => { keyBtnRefs.current[lowerK] = el; };
    const h = isLargeKeyboard ? 'h-[48px]' : 'h-[34px]';
    const fs = isLargeKeyboard ? 'text-[18px]' : 'text-[15px]';
    const r = isLargeKeyboard ? 'rounded-[9px]' : 'rounded-[7px]';
    return (
      <button
        key={k}
        ref={ref}
        type="button"
        onPointerDown={(e) => { e.preventDefault(); handleKeyPointerDown(lowerK, keyBtnRefs.current[lowerK]); }}
        onPointerUp={() => handleKeyPointerUp(lowerK)}
        onPointerLeave={handleKeyPointerLeave}
        onPointerCancel={handleKeyPointerLeave}
        className={`${h} ${r} ${fs} font-medium transition-all flex-1 min-w-0 touch-none select-none ${
          isHighlighted
            ? 'bg-white dark:bg-white text-slate-900 scale-95 shadow-md'
            : 'bg-white/90 dark:bg-white/[0.08] text-slate-900 dark:text-white hover:bg-white dark:hover:bg-white/[0.14] active:scale-95 shadow-sm'
        }`}
      >
        {k}
      </button>
    );
  }

  const symRows = symMode ? [SYM_ROW1, SYM_ROW2, SYM_ROW3, SYM_ROW4] : null;

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <style>{`
        @keyframes cursorBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
      <label className="block text-[13px] font-medium text-slate-400">{label}</label>
      <div
        className={`relative bg-slate-100 dark:bg-white/[0.04] border rounded-xl px-4 py-3 transition-all duration-200 cursor-text ${
          active
            ? 'border-sky-500/60 ring-2 ring-sky-500/20'
            : 'border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14]'
        }`}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!active) { onActivate?.(); }
          else { moveCursorTo(valueRef.current.length); }
        }}
      >
        <div className="text-slate-900 dark:text-white text-[15px] min-h-[20px] break-all whitespace-pre-wrap select-none" style={{ lineHeight: '20px', caretColor: 'transparent' }}>
          {displayValue ? (
            <>
              {active && cursorPos === 0 && (
                <span className="inline-block w-[1.5px] h-[15px] bg-sky-500 align-baseline flex-shrink-0" style={BLINK_STYLE} />
              )}
              {Array.from(displayValue).map((char, i) => (
                <span
                  key={i}
                  className="relative"
                  onPointerDown={(e) => { e.stopPropagation(); moveCursorTo(i + 1); if (!active) onActivate?.(); }}
                >
                  {char}
                  {active && i === cursorPos - 1 && (
                    <span className="inline-block w-[1.5px] h-[15px] bg-sky-500 align-baseline" style={BLINK_STYLE} />
                  )}
                </span>
              ))}
            </>
          ) : (
            <span className="text-slate-400 dark:placeholder-slate-600">
              {placeholder ?? (isEmail ? 'you@example.com' : 'Start typing...')}
              {active && (
                <span className="inline-block w-[1.5px] h-[15px] bg-sky-500 align-baseline ml-0.5" style={BLINK_STYLE} />
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 absolute right-3.5 top-1/2 -translate-y-1/2" onPointerDown={(e) => e.stopPropagation()}>
          {!isEmail && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShow(s => !s); }}
              tabIndex={-1}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0.5"
              title={show ? 'Hide characters' : 'Show characters'}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          )}
        </div>
      </div>

      {/* Accent character popup */}
      {accentPopup && createPortal(
        <>
          <div className="fixed inset-0 z-[10001]" onClick={() => setAccentPopup(null)} />
          <div
            className="fixed z-[10002] bg-white dark:bg-slate-700 border border-slate-200 dark:border-white/20 rounded-xl shadow-2xl p-1.5 flex gap-1"
            style={{ left: accentPopup.x, top: accentPopup.y - 50, transform: 'translateX(-50%)' }}
          >
            {(ACCENTS[accentPopup.key] ?? []).map(a => (
              <button
                key={a}
                type="button"
                onClick={() => selectAccent(a)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-[16px] font-medium text-slate-900 dark:text-white transition-colors"
              >
                {(shift || capsLock) ? a.toUpperCase() : a}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {/* On-screen keyboard — docked to the bottom of the screen like a native keyboard */}
      {active && createPortal(
      <div
        ref={kbdRef}
        className="fixed inset-x-0 bottom-0 z-[10000] select-none"
        style={{ touchAction: 'none', animation: 'kbdSlideUp 0.25s ease-out' }}
      >
        <div className={`mx-auto w-full max-w-[860px] bg-slate-50 dark:bg-[#080c14] px-2 pt-2 pb-[calc(10px+env(safe-area-inset-bottom))] ${isLargeKeyboard ? 'space-y-[6px]' : 'space-y-[4px]'}`}>
        {/* Number row */}
        <div className={`flex ${isLargeKeyboard ? 'gap-[5px]' : 'gap-[3px]'}`}>
          {NUM_ROW.map(k => keyBtn(k))}
        </div>

        {/* Symbol rows */}
        {symRows?.map((row, ri) => (
          <div key={ri} className={`flex ${isLargeKeyboard ? 'gap-[5px]' : 'gap-[3px]'}`}>
            {row.map(k => keyBtn(k))}
          </div>
        ))}

        {/* QWERTY rows */}
        {!symMode && (
          <>
            <div className={`flex ${isLargeKeyboard ? 'gap-[5px]' : 'gap-[3px]'}`}>
              {row1.map(k => keyBtn(k))}
            </div>
            <div className={`flex ${isLargeKeyboard ? 'gap-[5px]' : 'gap-[3px]'} justify-center px-[5%]`}>
              {row2.map(k => keyBtn(k))}
            </div>
            <div className={`flex ${isLargeKeyboard ? 'gap-[5px]' : 'gap-[3px]'}`}>
              <button
                type="button"
                onClick={() => setShift(s => !s)}
                className={`flex-shrink-0 ${isLargeKeyboard ? 'h-[48px] w-[56px] rounded-[9px] text-[18px]' : 'h-[34px] w-[40px] rounded-[7px] text-[16px]'} font-medium transition-all flex items-center justify-center ${
                  shift ? 'bg-white dark:bg-white text-slate-900 shadow-md' : 'bg-slate-300/80 dark:bg-white/[0.12] text-slate-700 dark:text-slate-300 hover:bg-slate-400/80 dark:hover:bg-white/[0.18] active:scale-95'
                }`}
              >
                <ArrowUp size={isLargeKeyboard ? 20 : 16} />
              </button>
              {row3.map(k => keyBtn(k))}
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); startBackspaceRepeat(); }}
                onPointerUp={stopBackspaceRepeat}
                onPointerLeave={stopBackspaceRepeat}
                onPointerCancel={stopBackspaceRepeat}
                className={`flex-shrink-0 ${isLargeKeyboard ? 'h-[48px] w-[56px] rounded-[9px]' : 'h-[34px] w-[40px] rounded-[7px]'} flex items-center justify-center transition-all ${
                  activeKey === 'backspace' ? 'bg-white dark:bg-white text-slate-900 scale-95 shadow-md' : 'bg-slate-300/80 dark:bg-white/[0.12] text-slate-700 dark:text-slate-300 hover:bg-slate-400/80 dark:hover:bg-white/[0.18] active:scale-95'
                }`}
              >
                <Delete size={isLargeKeyboard ? 20 : 16} />
              </button>
            </div>
          </>
        )}

        {/* Bottom row */}
        <div className={`flex ${isLargeKeyboard ? 'gap-[5px]' : 'gap-[3px]'}`}>
          <button
            type="button"
            onClick={() => setSymMode(s => !s)}
            className={`flex-shrink-0 ${isLargeKeyboard ? 'h-[48px] w-[56px] rounded-[9px] text-[15px]' : 'h-[34px] w-[40px] rounded-[7px] text-[13px]'} font-medium transition-all ${
              symMode ? 'bg-slate-300/80 dark:bg-white/[0.18] text-slate-900 dark:text-white' : 'bg-slate-300/80 dark:bg-white/[0.12] text-slate-700 dark:text-slate-300 hover:bg-slate-400/80 dark:hover:bg-white/[0.18] active:scale-95'
            }`}
          >
            {symMode ? 'ABC' : '123'}
          </button>
          <button
            type="button"
            onClick={pasteFromClipboard}
            className={`flex-shrink-0 ${isLargeKeyboard ? 'h-[48px] w-[44px] rounded-[9px]' : 'h-[34px] w-[32px] rounded-[7px]'} flex items-center justify-center transition-all bg-slate-300/80 dark:bg-white/[0.12] text-slate-700 dark:text-slate-300 hover:bg-slate-400/80 dark:hover:bg-white/[0.18] active:scale-95`}
            title="Paste from clipboard"
          >
            <Clipboard size={isLargeKeyboard ? 18 : 14} />
          </button>
          <button
            type="button"
            onClick={() => moveCursorTo(cursorPosRef.current - 1)}
            className={`flex-shrink-0 ${isLargeKeyboard ? 'h-[48px] w-[36px] rounded-[9px]' : 'h-[34px] w-[28px] rounded-[7px]'} flex items-center justify-center transition-all bg-slate-300/80 dark:bg-white/[0.12] text-slate-700 dark:text-slate-300 hover:bg-slate-400/80 dark:hover:bg-white/[0.18] active:scale-95`}
            title="Move cursor left"
          >
            <ArrowLeft size={isLargeKeyboard ? 18 : 14} />
          </button>
          <button
            type="button"
            onClick={() => moveCursorTo(cursorPosRef.current + 1)}
            className={`flex-shrink-0 ${isLargeKeyboard ? 'h-[48px] w-[36px] rounded-[9px]' : 'h-[34px] w-[28px] rounded-[7px]'} flex items-center justify-center transition-all bg-slate-300/80 dark:bg-white/[0.12] text-slate-700 dark:text-slate-300 hover:bg-slate-400/80 dark:hover:bg-white/[0.18] active:scale-95`}
            title="Move cursor right"
          >
            <ArrowRight size={isLargeKeyboard ? 18 : 14} />
          </button>
          <button
            type="button"
            onClick={handleSpace}
            className={`flex-1 ${isLargeKeyboard ? 'h-[48px] rounded-[9px] text-[15px]' : 'h-[34px] rounded-[7px] text-[13px]'} font-medium transition-all ${
              activeKey === 'space' ? 'bg-white dark:bg-white text-slate-900 scale-95 shadow-md' : 'bg-slate-300/80 dark:bg-white/[0.12] text-slate-700 dark:text-slate-300 hover:bg-slate-400/80 dark:hover:bg-white/[0.18] active:scale-95'
            }`}
          >
            space
          </button>
          <button
            type="button"
            onClick={() => onDismiss?.()}
            title="Hide keyboard"
            className={`flex-shrink-0 ${isLargeKeyboard ? 'h-[48px] w-[48px] rounded-[9px]' : 'h-[34px] w-[36px] rounded-[7px]'} flex items-center justify-center transition-all bg-slate-300/80 dark:bg-white/[0.12] text-slate-700 dark:text-slate-300 hover:bg-slate-400/80 dark:hover:bg-white/[0.18] active:scale-95`}
          >
            <ChevronDown size={isLargeKeyboard ? 22 : 18} />
          </button>
          <button
            type="button"
            onClick={() => onSubmit?.()}
            className={`flex-shrink-0 ${isLargeKeyboard ? 'h-[48px] w-[60px] rounded-[9px]' : 'h-[34px] w-[44px] rounded-[7px]'} flex items-center justify-center transition-all ${
              activeKey === 'enter' ? 'bg-white dark:bg-white text-slate-900 scale-95 shadow-md' : 'bg-sky-500 text-white hover:bg-sky-400 active:scale-95 shadow-sm'
            }`}
          >
            <Return size={isLargeKeyboard ? 20 : 16} />
          </button>
        </div>

        </div>
      </div>,
      document.body
      )}

    </div>
  );
}
