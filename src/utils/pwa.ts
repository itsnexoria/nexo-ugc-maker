import { create } from 'zustand';
import { useUI } from '../store/ui';

/** Install prompt + offline readiness. Everything here is optional and fails quietly. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  canInstall: boolean;
  installed: boolean;
  offline: boolean;
  offlineReady: boolean;
  install: () => Promise<void>;
}

let deferred: BeforeInstallPromptEvent | null = null;

export const usePwa = create<PwaState>((set) => ({
  canInstall: false,
  installed: typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)')?.matches,
  offline: typeof navigator !== 'undefined' && navigator.onLine === false,
  offlineReady: false,
  install: async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    set({ canInstall: false, installed: outcome === 'accepted' });
  },
}));

export function initPwa(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    usePwa.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installed: true, canInstall: false }));
  window.addEventListener('online', () => usePwa.setState({ offline: false }));
  window.addEventListener('offline', () => usePwa.setState({ offline: true }));

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const hadController = !!navigator.serviceWorker.controller;
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state !== 'installed') return;
            if (hadController) {
              useUI.getState().toast('info', 'A new version is ready.', { label: 'Reload', onClick: () => window.location.reload() });
            } else {
              usePwa.setState({ offlineReady: true });
              let told = false;
              try {
                told = localStorage.getItem('nexo-offline-told') === '1';
                localStorage.setItem('nexo-offline-told', '1');
              } catch {
                /* ignore */
              }
              if (!told) useUI.getState().toast('success', 'Ready to work offline. Your projects stay on this device.');
            }
          });
        });
        if (reg.active && !reg.installing) usePwa.setState({ offlineReady: true });
      })
      .catch(() => {
        /* offline mode is a bonus; the app works without it */
      });
  });
}
