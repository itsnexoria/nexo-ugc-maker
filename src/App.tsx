import { useEffect, useState } from 'react';
import { BottomPanel } from './panels/BottomPanel';
import { RightPanel } from './panels/RightPanel';
import { TopBar } from './components/TopBar';
import { Toolbox } from './components/Toolbox';
import { ViewportOverlay } from './components/ViewportOverlay';
import { BusyOverlay, ConfirmHost, ContextMenuHost, PromptHost, ToastHost } from './components/ui/Overlays';
import { Home } from './home/Home';
import { ExportModal } from './modals/ExportModal';
import { ExportClothingModal } from './modals/ExportClothingModal';
import { ClothingWorkspace } from './clothing/ClothingEditor';
import { NewProjectModal, OpenProjectModal } from './modals/ProjectModals';
import { AboutModal, ShortcutsModal } from './modals/InfoModals';
import { SettingsModal } from './modals/SettingsModal';
import { BrandMark } from './components/Brand';
import { useShortcuts } from './hooks/useShortcuts';
import { useEditor } from './store/editor';
import { applyTheme, useSettings } from './store/settings';
import { captureMissingThumbnail, saveNow, startAutosave } from './store/session';
import { seedIfFirstRun } from './store/projects';
import { useUI } from './store/ui';
import { useViewport } from './store/viewport';
import { Viewport } from './viewport/Viewport';

function Workspace() {
  const preview = useViewport((s) => s.previewMode);
  const projectId = useEditor((s) => s.project.id);

  useEffect(() => {
    const t = setTimeout(() => void captureMissingThumbnail(), 1800);
    return () => clearTimeout(t);
  }, [projectId]);

  return (
    <div className={`app ${preview ? 'preview' : ''}`}>
      <TopBar />
      <div className="workspace">
        <Toolbox />
        <div className="center">
          <div className="viewport-area">
            <Viewport key={projectId} />
            <ViewportOverlay />
          </div>
          <BottomPanel />
        </div>
        <RightPanel />
      </div>
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
  const small = size.w < 1100 || size.h < 640;
  if (small && !dismissed) {
    return (
      <div className="small-screen">
        <BrandMark size={64} />
        <h1>Nexo UGC Studio works best on desktop</h1>
        <p className="dim">The editor needs room for a 3D viewport and panels. Open it on a computer, or widen this window to at least 1100 × 640 pixels (1366 × 768 recommended).</p>
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
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('error', onError);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('error', onError);
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
      {screen === 'editor' && <Workspace />}
      {screen === 'clothing' && <ClothingWorkspace />}
      {modal === 'settings' && <SettingsModal />}
      {modal === 'export' && <ExportModal />}
      {modal === 'exportClothing' && <ExportClothingModal />}
      {modal === 'new' && <NewProjectModal />}
      {modal === 'open' && <OpenProjectModal />}
      {modal === 'shortcuts' && <ShortcutsModal />}
      {modal === 'about' && <AboutModal />}
      <ConfirmHost />
      <PromptHost />
      <ContextMenuHost />
      <ToastHost />
      <BusyOverlay />
    </SmallScreenGate>
  );
}
