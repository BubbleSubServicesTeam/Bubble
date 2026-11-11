import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Check for updates every 60 seconds
      setInterval(() => reg.update().catch(() => {}), 60000);
    }).catch(() => {
      // SW registration failed (e.g. StackBlitz) — app still works without it
    });

    // Force reload when a new SW takes over — guard against loops
    let reloadTriggered = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadTriggered) return;
      reloadTriggered = true;
      window.location.reload();
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
