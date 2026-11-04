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
  onTab?: (shiftKey: boolean) => void;
  cursorAtEnd?: boolean;
  showField?: boolean;
};

type KeyMode = 'letters' | 'numbers' | 'symbols';

const ROW1 = ['q','w','e','r','t','y','u','i','o','p'];
const ROW2 = ['a','s','d','f','g','h','j','k','l'];
const ROW3 = ['z','x','c','v','b','n','m'];

const SWIPE_DIGITS: Record<string, string> = { q: '1', w: '2', e: '3', r: '4', t: '5', y: '6', u: '7', i: '8', o: '9', p: '0', a: '@', s: '#', d: '&', f: '*', g: '-', h: '+', j: '(', k: ')', l: '"', z: '/', x: '!', c: ',', v: '.', b: ';', n: ':', m: '_' };
const SWIPE_THRESHOLD = 18;
const SWIPE_UP_RETURN = 14;
const SWIPE_UP_CANCEL = 50;
const NUM_ROW = ['1','2','3','4','5','6','7','8','9','0'];
const NUM_ROW2 = ['-','/',':',';','(',')','$','&','@','"'];
const NUM_ROW3 = ['.',',','?','!',"'"];
const SYM_ROW1 = ['[',']','{','}','#','%','^','*','+','='];
const SYM_ROW2 = ['_','\\','|','~','<','>','€','£','¥','•'];

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
  '0': ['°'],
  '-': ['–','—'],
  '$': ['€','£','¥','¢'],
  '"': ['“','”','„','«','»'],
  "'": ['‘','’','‚'],
  '.': ['…'],
  '?': ['¿'],
  '!': ['¡'],
  '/': ['\\'],
  '%': ['‰'],
  '=': ['≠','≈','±'],
  '<': ['≤'],
  '>': ['≥'],
};

const FUNC_KEY_CLASS = 'bg-slate-300/80 dark:bg-white/[0.12] text-slate-700 dark:text-slate-300 hover:bg-slate-400/80 dark:hover:bg-white/[0.18] active:scale-95';
const PRESSED_KEY_CLASS = 'bg-white dark:bg-white text-slate-900 scale-95 shadow-md';

const BLINK_STYLE: React.CSSProperties = { animation: 'cursorBlink 1.1s steps(2) infinite' };

export default function KeyboardPassword({ label, value, onChange, placeholder, onSubmit, isEmail, active = true, onActivate, onDismiss, onTab, cursorAtEnd = false, showField = true }: Props) {
  const [show, setShow] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [shift, setShift] = useState(false);
  const [mode, setMode] = useState<KeyMode>('letters');
  const [capsLock, setCapsLock] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [accentPopup, setAccentPopup] = useState<{ key: string; x: number; y: number } | null>(null);
  const [swipe, setSwipe] = useState<{ digit: string; x: number; y: number } | null>(null);
  const [pressedPreview, setPressedPreview] = useState<{ key: string; x: number; y: number } | null>(null);
  const swipeRef = useRef<{ digit: string; x: number; y: number } | null>(null);
  const swipeStartRef = useRef<{ key: string; x: number; y: number } | null>(null);
  const swipeCancelledRef = useRef(false);
  const swipeReturnedRef = useRef(false);
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
      const start = cursorAtEnd ? valueRef.current.length : 0;
      setCursorPos(start);
      cursorPosRef.current = start;
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
    if (e.key === 'Tab') { e.preventDefault(); onTab?.(e.shiftKey); }
    else if (e.key === 'Backspace') { e.preventDefault(); handleBackspace(false); }
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
    if (btnEl) {
      const rect = btnEl.getBoundingClientRect();
      setPressedPreview({ key: k, x: rect.left + rect.width / 2, y: rect.top });
    }
    startLongPress(k, btnEl);
  }

  function handleKeyPointerUp(k: string) {
    cancelLongPress();
    setPressedPreview(null);
    if (swipeCancelledRef.current) {
      swipeCancelledRef.current = false;
      swipeRef.current = null;
      swipeStartRef.current = null;
      swipeReturnedRef.current = false;
      setSwipe(null);
      pressedKeyRef.current = null;
      return;
    }
    if (swipeRef.current) {
      insertAtCursor(swipeRef.current.digit);
      swipeRef.current = null;
      swipeStartRef.current = null;
      swipeReturnedRef.current = false;
      setSwipe(null);
      pressedKeyRef.current = null;
      return;
    }
    if (accentPopup) {
      pressedKeyRef.current = null;
      return;
    }
    if (pressedKeyRef.current === k) {
      handleKey(k);
    }
    pressedKeyRef.current = null;
  }

  function handleKeyPointerMove(e: React.PointerEvent<HTMLButtonElement>, k: string) {
    const start = swipeStartRef.current;
    const digit = SWIPE_DIGITS[k];
    if (!start || start.key !== k || !digit) return;
    const dy = e.clientY - start.y;

    // Big swipe up cancels — no input on release
    if (dy < -SWIPE_UP_CANCEL) {
      swipeCancelledRef.current = true;
      swipeRef.current = null;
      setSwipe(null);
      setPressedPreview({ key: k, x: start.x, y: start.y - 0 });
      return;
    }

    // If we previously cancelled but user swipes back down, un-cancel
    if (swipeCancelledRef.current && dy > -SWIPE_UP_RETURN) {
      swipeCancelledRef.current = false;
    }

    let active = swipeRef.current;

    // Swipe down past threshold: show alternate character
    if (!active) {
      if (dy < SWIPE_THRESHOLD || dy < Math.abs(e.clientX - start.x)) return;
      if (swipeCancelledRef.current) return;
      cancelLongPress();
      pressedKeyRef.current = null;
      swipeReturnedRef.current = false;
      const rect = e.currentTarget.getBoundingClientRect();
      active = { digit, x: rect.left + rect.width / 2, y: rect.top };
      swipeRef.current = active;
      setPressedPreview({ key: digit, x: active.x, y: active.y });
      setSwipe(active);
      return;
    }

    // Slight swipe up after seeing alternate: return to the letter
    if (dy < SWIPE_UP_RETURN && !swipeReturnedRef.current) {
      swipeReturnedRef.current = true;
      swipeRef.current = null;
      setSwipe(null);
      setPressedPreview({ key: k, x: active.x, y: active.y });
      return;
    }

    // Swipe back down after returning to letter: show alternate again
    if (dy >= SWIPE_THRESHOLD && swipeReturnedRef.current) {
      swipeReturnedRef.current = false;
      swipeRef.current = active;
      setPressedPreview({ key: digit, x: active.x, y: active.y });
      setSwipe(active);
      return;
    }

    if (dy < SWIPE_THRESHOLD) {
      swipeRef.current = null;
      setSwipe(null);
      return;
    }
    setSwipe(active);
  }

  function handleKeyPointerLeave() {
    cancelLongPress();
    setPressedPreview(null);
    pressedKeyRef.current = null;
    swipeCancelledRef.current = false;
    swipeReturnedRef.current = false;
    if (!swipeRef.current) swipeStartRef.current = null;
  }

  const displayValue = (isEmail || show) ? value : '•'.repeat(value.length);

  const upper = shift || capsLock;
  const letterRow1 = upper ? ROW1.map(k => k.toUpperCase()) : ROW1;
  const letterRow2 = upper ? ROW2.map(k => k.toUpperCase()) : ROW2;
  const letterRow3 = upper ? ROW3.map(k => k.toUpperCase()) : ROW3;

  function keyBtn(k: string) {
    const lowerK = k.toLowerCase();
    const isHighlighted = activeKey === k || activeKey === lowerK;
    const hint = mode === 'letters' ? SWIPE_DIGITS[lowerK] : undefined;
    const ref = (el: HTMLButtonElement | null) => { keyBtnRefs.current[lowerK] = el; };
    const h = isLargeKeyboard ? 'h-[48px]' : 'h-[34px]';
    const fs = isLargeKeyboard ? 'text-[18px]' : 'text-[15px]';
    const r = isLargeKeyboard ? 'rounded-[9px]' : 'rounded-[7px]';
    return (
      <button
        key={k}
        ref={ref}
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          swipeStartRef.current = { key: lowerK, x: e.clientX, y: e.clientY };
          handleKeyPointerDown(lowerK, keyBtnRefs.current[lowerK]);
        }}
        onPointerMove={(e) => handleKeyPointerMove(e, lowerK)}
        onPointerUp={() => handleKeyPointerUp(lowerK)}
        onPointerLeave={handleKeyPointerLeave}
        onPointerCancel={handleKeyPointerLeave}
        className={`relative col-span-2 ${h} ${r} ${fs} font-medium transition-all min-w-0 touch-none select-none flex flex-col items-center justify-center ${
          isHighlighted
            ? `${PRESSED_KEY_CLASS} text-slate-900`
            : 'bg-white/90 dark:bg-white/[0.08] text-slate-900 dark:text-white hover:bg-white dark:hover:bg-white/[0.14] active:scale-95 shadow-sm'
        }`}
      >
        {hint && <span aria-hidden className="pointer-events-none absolute top-[2px] left-1/2 -translate-x-1/2 text-[11px] leading-none font-normal text-slate-400 dark:text-slate-500">{hint}</span>}
        <span className="mt-[6px]">{k}</span>
      </button>
    );
  }

  const gap = isLargeKeyboard ? 'gap-[5px]' : 'gap-[3px]';
  const rowGrid = `grid grid-cols-[repeat(20,minmax(0,1fr))] ${gap}`;
  const sideSize = isLargeKeyboard ? 'h-[48px] rounded-[9px]' : 'h-[34px] rounded-[7px]';
  const iconSize = isLargeKeyboard ? 20 : 16;
  const utilSize = isLargeKeyboard ? 'h-[48px] w-[44px] rounded-[9px]' : 'h-[34px] w-[32px] rounded-[7px]';
  const cursorSize = isLargeKeyboard ? 'h-[48px] w-[36px] rounded-[9px]' : 'h-[34px] w-[28px] rounded-[7px]';
  const labelSize = isLargeKeyboard ? 'text-[15px]' : 'text-[13px]';
  const shiftOn = shift || capsLock;

  function backspaceKey(span: string) {
    return (
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); startBackspaceRepeat(); }}
        onPointerUp={stopBackspaceRepeat}
        onPointerLeave={stopBackspaceRepeat}
        onPointerCancel={stopBackspaceRepeat}
        title="Delete"
        className={`${span} ${sideSize} flex items-center justify-center transition-all ${
          activeKey === 'backspace' ? PRESSED_KEY_CLASS : FUNC_KEY_CLASS
        }`}
      >
        <Delete size={iconSize} />
      </button>
    );
  }

  function pageSwitchKey(label: string, target: KeyMode, extraClass: string) {
    return (
      <button
        type="button"
        onClick={() => setMode(target)}
        className={`flex-shrink-0 ${extraClass} font-medium transition-all ${labelSize} ${FUNC_KEY_CLASS}`}
      >
        {label}
      </button>
    );
  }

  function renderLetterRows() {
    return (
      <>
        <div className={rowGrid}>{letterRow1.map(k => keyBtn(k))}</div>
        <div className={rowGrid}>
          <button
            type="button"
            onClick={() => setShift(s => !s)}
            title="Shift"
            className={`col-span-2 ${sideSize} flex items-center justify-center transition-all ${
              shiftOn ? PRESSED_KEY_CLASS : FUNC_KEY_CLASS
            }`}
          >
            <ArrowUp size={iconSize} />
          </button>
          {letterRow2.map(k => keyBtn(k))}
        </div>
        <div className={rowGrid}>
          {pageSwitchKey('#+=', 'symbols', `col-span-2 ${sideSize}`)}
          {letterRow3.map(k => keyBtn(k))}
          {backspaceKey('col-span-4')}
        </div>
      </>
    );
  }

  function renderSymbolRows(row1: string[], row2: string[], leftKey: React.ReactNode, rowThree: string[]) {
    return (
      <>
        <div className={rowGrid}>{row1.map(k => keyBtn(k))}</div>
        <div className={rowGrid}>{row2.map(k => keyBtn(k))}</div>
        <div className={rowGrid}>
          {leftKey}
          {rowThree.map(k => keyBtn(k))}
          {backspaceKey('col-span-5')}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <style>{`
        @keyframes cursorBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
      {showField && (<>
      <label className="block text-[13px] font-medium text-slate-400">{label}</label>
      <div
        tabIndex={0}
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
                <span className="inline-block w-[1.5px] h-[16px] bg-sky-500 align-middle flex-shrink-0" style={BLINK_STYLE} />
              )}
              {Array.from(displayValue).map((char, i) => (
                <span
                  key={i}
                  className="relative"
                  onPointerDown={(e) => { e.stopPropagation(); moveCursorTo(i + 1); if (!active) onActivate?.(); }}
                >
                  {char}
                  {active && i === cursorPos - 1 && (
                    <span className="inline-block w-[1.5px] h-[20px] bg-sky-500 align-middle" style={BLINK_STYLE} />
                  )}
                </span>
              ))}
            </>
          ) : (
            <span className="inline-flex items-center text-slate-400 dark:placeholder-slate-600">
              {active && (
                <span className="inline-block w-[1.5px] h-[20px] bg-sky-500 align-middle mr-1" style={BLINK_STYLE} />
              )}
              {placeholder ?? (isEmail ? 'you@example.com' : 'Start typing...')}
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
      </>)}

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
                {shiftOn ? a.toUpperCase() : a}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {pressedPreview && createPortal(
        <div
          className="fixed z-[10002] pointer-events-none flex items-center justify-center w-14 h-14 -translate-x-1/2 rounded-t-2xl rounded-b-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-3xl font-medium shadow-xl"
          style={{ left: pressedPreview.x, top: pressedPreview.y - 58 }}
        >
          {shiftOn ? pressedPreview.key.toUpperCase() : pressedPreview.key}
        </div>,
        document.body
      )}

      {swipe && createPortal(
        <div
          className="fixed z-[10001] pointer-events-none -translate-x-1/2 text-[11px] font-medium leading-none text-slate-400 dark:text-slate-500"
          style={{ left: swipe.x, top: swipe.y - 14 }}
        >
          {swipe.digit}
        </div>,
        document.body
      )}

      {/* On-screen keyboard — docked to the bottom of the screen like a native keyboard */}
      {active && createPortal(
      <div
        ref={kbdRef}
        className="fixed inset-x-0 bottom-0 z-[10000] select-none"
        style={{ touchAction: 'none', animation: 'kbdSlideUp 0.25s ease-out' }}
      >
        <div className={`w-full bg-slate-50 dark:bg-[#080c14] px-2 pt-2 pb-[calc(10px+env(safe-area-inset-bottom))] ${isLargeKeyboard ? 'space-y-[6px]' : 'space-y-[4px]'}`}>
          {mode === 'letters' && renderLetterRows()}
          {mode === 'numbers' && (
            <>
              <div className={rowGrid}>{NUM_ROW.map(k => keyBtn(k))}</div>
              <div className={rowGrid}>{NUM_ROW2.map(k => keyBtn(k))}</div>
              <div className={rowGrid}>
                {pageSwitchKey('#+=', 'symbols', `col-span-5 ${sideSize}`)}
                {NUM_ROW3.map(k => keyBtn(k))}
                {backspaceKey('col-span-5')}
              </div>
            </>
          )}
          {mode === 'symbols' && renderSymbolRows(
            SYM_ROW1,
            SYM_ROW2,
            pageSwitchKey('123', 'numbers', `col-span-5 ${sideSize}`),
            NUM_ROW3,
          )}

          {/* Bottom row — grid aligned with letter rows */}
          <div className={rowGrid}>
            {mode === 'letters'
              ? pageSwitchKey('123', 'numbers', `col-span-2 ${sideSize}`)
              : pageSwitchKey('ABC', 'letters', `col-span-2 ${sideSize}`)}
            <button
              type="button"
              onClick={pasteFromClipboard}
              className={`col-span-1 ${sideSize} flex items-center justify-center transition-all ${FUNC_KEY_CLASS}`}
              title="Paste from clipboard"
            >
              <Clipboard size={isLargeKeyboard ? 14 : 11} />
            </button>
            <button
              type="button"
              onClick={() => moveCursorTo(cursorPosRef.current - 1)}
              className={`col-span-1 ${sideSize} flex items-center justify-center transition-all ${FUNC_KEY_CLASS}`}
              title="Move cursor left"
            >
              <ArrowLeft size={isLargeKeyboard ? 14 : 11} />
            </button>
            <button
              type="button"
              onClick={() => moveCursorTo(cursorPosRef.current + 1)}
              className={`col-span-2 ${sideSize} flex items-center justify-center transition-all ${FUNC_KEY_CLASS}`}
              title="Move cursor right"
            >
              <ArrowRight size={isLargeKeyboard ? 16 : 13} />
            </button>
            <button
              type="button"
              onClick={() => handleSpace()}
              className={`col-span-10 ${sideSize} flex items-center justify-center font-medium transition-all ${labelSize} ${
                activeKey === 'space' ? PRESSED_KEY_CLASS : FUNC_KEY_CLASS
              }`}
            >
              space
            </button>
            <button
              type="button"
              onClick={() => onDismiss?.()}
              title="Hide keyboard"
              className={`col-span-2 ${sideSize} flex items-center justify-center transition-all ${FUNC_KEY_CLASS}`}
            >
              <ChevronDown size={iconSize} />
            </button>
            <button
              type="button"
              onClick={() => onSubmit?.()}
              className={`col-span-2 ${sideSize} flex items-center justify-center transition-all ${
                activeKey === 'enter' ? PRESSED_KEY_CLASS : 'bg-sky-500 text-white hover:bg-sky-400 active:scale-95 shadow-sm'
              }`}
            >
              <Return size={iconSize} />
            </button>
          </div>
        </div>
      </div>,
      document.body
      )}

    </div>
  );
}
