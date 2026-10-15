import { useEffect } from 'react';
import { BottomPanel } from './panels/BottomPanel';
import { RightPanel } from './panels/RightPanel';
import { TopBar } from './components/TopBar';
import { Toolbox } from './components/Toolbox';
import { ViewportOverlay } from './components/ViewportOverlay';
import { PHONE_BELOW as _unused, useCompact } from './hooks/useCompact';
import { useEditor } from './store/editor';
import { captureMissingThumbnail } from './store/session';
import { useUI } from './store/ui';
import { useViewport } from './store/viewport';
import { tourSeen } from './components/Tour';
import { Viewport } from './viewport/Viewport';

export default function AccessoryWorkspace() {
  const preview = useViewport((s) => s.previewMode);
  const projectId = useEditor((s) => s.project.id);
  const compact = useCompact();
  const panelsOpen = useUI((s) => s.panelsOpen);

  useEffect(() => {
    const t = setTimeout(() => void captureMissingThumbnail(), 1800);
    const tour = setTimeout(() => {
      if (!tourSeen('accessory') && !useUI.getState().modal) useUI.getState().startTour('accessory');
    }, 1200);
    return () => {
      clearTimeout(t);
      clearTimeout(tour);
    };
  }, [projectId]);

  return (
    <div className={`app ${preview ? 'preview' : ''} ${compact ? 'compact' : ''} ${panelsOpen ? 'panels-open' : ''}`}>
      <TopBar />
      <div className="workspace">
        <Toolbox />
        <main className="center">
          <h1 className="sr-only">Nexo UGC Studio: accessory editor</h1>
          <div className="viewport-area">
            <Viewport key={projectId} />
            <ViewportOverlay />
          </div>
          <BottomPanel />
        </main>
        <RightPanel />
      </div>
    </div>
  );
}


