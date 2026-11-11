import { useEffect, useState } from 'react';

function isScreenshotShortcut(e: KeyboardEvent): boolean {
  if (e.key === 'PrintScreen') return true;
  if (e.metaKey && e.shiftKey && (e.code === 'Digit3' || e.code === 'Digit4' || e.code === 'Digit5')) return true;
  if (e.metaKey && e.shiftKey && e.code === 'KeyS') return true;
  return false;
}

export function useCaptureShield(hideMs = 3000): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const trigger = () => {
      setHidden(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setHidden(false), hideMs);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isScreenshotShortcut(e)) trigger();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') trigger();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', trigger);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', trigger);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer) clearTimeout(timer);
    };
  }, [hideMs]);

  return hidden;
}
