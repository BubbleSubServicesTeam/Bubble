import { useEffect, useState, type CSSProperties } from 'react';

export type MessageKeyboard = 'system' | 'bubble';

const STORAGE_KEY = 'bubble-message-keyboard';
const CHANGE_EVENT = 'bubble-message-keyboard-change';

function readMessageKeyboard(): MessageKeyboard {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'bubble' ? 'bubble' : 'system';
  } catch {
    return 'bubble';
  }
}

export function setMessageKeyboard(value: MessageKeyboard) {
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useMessageKeyboard(): MessageKeyboard {
  const [value, setValue] = useState<MessageKeyboard>(readMessageKeyboard);
  useEffect(() => {
    const sync = () => setValue(readMessageKeyboard());
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);
  return value;
}

// Tracks the Bubble keyboard's height (via the --kbd-h CSS variable) so a full-screen
// page can scale itself down to fit in the space above the keyboard.
export function useBubbleKeyboardHeight(enabled: boolean): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setHeight(0);
      return;
    }
    const root = document.documentElement;
    const read = () => setHeight(parseFloat(root.style.getPropertyValue('--kbd-h')) || 0);
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['style'] });
    return () => {
      observer.disconnect();
      setHeight(0);
    };
  }, [enabled]);
  return height;
}

// Style that scales a full-screen page down (like a shrunken iframe) so it fits in
// the space above the Bubble keyboard. Returns undefined when no scaling is needed.
export function getScaledPageStyle(keyboardHeight: number, windowInnerHeight: number): CSSProperties | undefined {
  if (keyboardHeight <= 0) return undefined;
  const available = windowInnerHeight - keyboardHeight;
  if (available <= 0) return undefined;
  const scale = available / windowInnerHeight;
  return {
    height: `${windowInnerHeight}px`,
    width: `${Math.round(window.innerWidth / scale)}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
  };
}
