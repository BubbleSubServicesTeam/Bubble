import { useEffect, useState } from 'react';

export type MessageKeyboard = 'system' | 'bubble';

const STORAGE_KEY = 'bubble-message-keyboard';
const CHANGE_EVENT = 'bubble-message-keyboard-change';

function readMessageKeyboard(): MessageKeyboard {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'bubble' ? 'bubble' : 'system';
  } catch {
    return 'system';
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
