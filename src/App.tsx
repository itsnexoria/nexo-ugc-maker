import { Suspense, lazy, useEffect, useState } from 'react';
import { BusyOverlay, ConfirmHost, ContextMenuHost, PromptHost, ToastHost } from './components/ui/Overlays';
import { Home } from './home/Home';
import { NewProjectModal, OpenProjectModal } from './modals/ProjectModals';
import { AboutModal, ShortcutsModal } from './modals/InfoModals';
import { SettingsModal } from './modals/SettingsModal';
import { BrandMark } from './components/Brand';
import { useShortcuts } from './hooks/useShortcuts';
import { PHONE_BELOW } from './hooks/useCompact';
import { useEditor } from './store/editor';
import { applyTheme, useSettings } from './store/settings';
import { saveNow, startAutosave } from './store/session';
import { seedIfFirstRun } from './store/projects';
import { useUI } from './store/ui';
import { Tour } from './components/Tour';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SaveBanner } from './components/SaveBanner';
import { CommandPalette } from './components/CommandPalette';
import { useStorageHealth } from './utils/storageHealth';

// Heavy screens and dialogs load on demand, so the home screen opens fast.
const lazyNamed = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const ExportModal = lazyNamed(() => import('./modals/ExportModal'), 'ExportModal');
const ExportClothingModal = lazyNamed(() => import('./modals/ExportClothingModal'), 'ExportClothingModal');
const PrivacyModal = lazyNamed(() => import('./modals/PrivacyModal'), 'PrivacyModal');
const R15FitModal = lazyNamed(() => import('./modals/R15FitModal'), 'R15FitModal');
const ReduceModal = lazyNamed(() => import('./modals/ReduceModal'), 'ReduceModal');
const UvModal = lazyNamed(() => import('./modals/UvModal'), 'UvModal');
const ClothingWorkspace = lazyNamed(() => import('./clothing/ClothingEditor'), 'ClothingWorkspace');
const Workspace = lazy(() => import('./AccessoryWorkspace'));

function ScreenFallback() {
  return (
    <div className="boot" role="status" aria-label="Loading">
      <div className="spinner" />
    </div>
  );
}

function SmallScreenGate({ children }: { children: React.ReactNode }) {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const h = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const small = size.w < PHONE_BELOW || size.h < 480;
  if (small && !dismissed) {
    return (
      <div className="small-screen">
        <BrandMark size={64} />
        <h1>Nexo UGC Studio works best on desktop</h1>
        <p className="dim">The editor needs room for a 3D viewport and panels. Open it on a computer, or use a tablet or a window at least 720 × 480 pixels (1366 × 768 recommended).</p>
        <button className="btn" onClick={() => setDismissed(true)}>
          Continue anyway
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const screen = useEditor((s) => s.screen);
  const modal = useUI((s) => s.modal);
  const theme = useSettings((s) => s.theme);
  useShortcuts();

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedIfFirstRun();
      } catch (e) {
        useUI.getState().toast('error', `Browser storage is unavailable: ${e instanceof Error ? e.message : 'unknown error'}. Projects will not persist.`);
      }
      if (!cancelled) useEditor.getState().setScreen('home');
    })();
    void useStorageHealth.getState().check(true);
    const stop = startAutosave();
    const onHide = () => {
      if (document.visibilityState === 'hidden' && useEditor.getState().project.saveStatus === 'unsaved' && useSettings.getState().autoSave) void saveNow(false);
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      const sc = useEditor.getState().screen;
      if ((sc === 'editor' || sc === 'clothing') && useEditor.getState().project.saveStatus !== 'saved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onError = (e: ErrorEvent) => useUI.getState().log('error', `${e.message}`);
    const onRejection = (e: PromiseRejectionEvent) => useUI.getState().log('error', `Unhandled: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <SmallScreenGate>
      {screen === 'boot' && (
        <div className="boot">
          <div className="spinner" />
        </div>
      )}
      {screen === 'home' && <Home />}
      <Suspense fallback={<ScreenFallback />}>
        {screen === 'editor' && <Workspace />}
        {screen === 'clothing' && <ClothingWorkspace />}
      </Suspense>
      {modal === 'settings' && <SettingsModal />}
      <Suspense fallback={null}>
        {modal === 'export' && <ExportModal />}
        {modal === 'exportClothing' && <ExportClothingModal />}
        {modal === 'privacy' && <PrivacyModal />}
        {modal === 'r15' && <R15FitModal />}
        {modal === 'reduce' && <ReduceModal />}
        {modal === 'uv' && <UvModal />}
      </Suspense>
      {modal === 'new' && <NewProjectModal />}
      {modal === 'open' && <OpenProjectModal />}
      {modal === 'shortcuts' && <ShortcutsModal />}
      {modal === 'palette' && <CommandPalette />}
      {modal === 'about' && <AboutModal />}
      <SaveBanner />
      <Tour />
      <ConfirmHost />
      <PromptHost />
      <ContextMenuHost />
      <ToastHost />
      <BusyOverlay />
    </SmallScreenGate>
  );
}
