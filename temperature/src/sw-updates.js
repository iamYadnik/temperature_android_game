import { showUpdatePrompt, hideUpdatePrompt } from './ui.js';

export function wireServiceWorkerUpdates(reg) {
  if (!reg) return;
  function promptAndUpdate() {
    showUpdatePrompt(() => {
      if (reg.waiting) {
        reg.waiting.postMessage('skip-waiting');
      }
    });
  }

  if (reg.waiting) {
    promptAndUpdate();
  }
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) {
        promptAndUpdate();
      }
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    hideUpdatePrompt();
    location.reload();
  });
}

