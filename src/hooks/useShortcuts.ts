import { useEffect } from 'react';
import { duplicateSelection, focusSelection, requestDelete, startRename } from '../editor/actions';
import { useEditor } from '../store/editor';
import { useClothing } from '../store/clothing';
import { useSettings } from '../store/settings';
import { saveNow } from '../store/session';
import { useUI } from '../store/ui';
import { CAMERA_TARGET, CAMERA_VIEWS, DEFAULT_CAMERA, useViewport, type CameraViewId } from '../store/viewport';

const VIEW_KEYS: CameraViewId[] = ['front', 'back', 'left', 'right', 'threeQuarter'];

function handleClothingKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const ui = useUI.getState();
  const cl = useClothing.getState();
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 's') {
    e.preventDefault();
    void saveNow(true);
    return;
  }
  if (typing || ui.modal || ui.confirm || ui.prompt) return;
  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) cl.redo();
    else cl.undo();
    return;
  }
  if (mod && key === 'y') {
    e.preventDefault();
    cl.redo();
    return;
  }
  if (mod && key === 'd') {
    e.preventDefault();
    if (cl.selectedId) cl.duplicateLayer(cl.selectedId);
    return;
  }
  if (mod || e.altKey) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && cl.selectedId) {
    e.preventDefault();
    cl.removeLayer(cl.selectedId);
    return;
  }
  if (e.key === 'Escape') {
    cl.select(null);
    cl.setTool('select');
    return;
  }
  if (e.key === '?') {
    ui.openModal('shortcuts');
    return;
  }
  const tools: Record<string, 'select' | 'place' | 'brush' | 'eraser'> = { v: 'select', p: 'place', b: 'brush', e: 'eraser' };
  if (tools[key]) cl.setTool(tools[key]);
  else if (key === 't') cl.addLayer('text');
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ed = useEditor.getState();
      if (ed.screen === 'clothing') {
        handleClothingKey(e);
        return;
      }
      if (ed.screen !== 'editor') return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const ui = useUI.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 's') {
        e.preventDefault();
        void saveNow(true);
        return;
      }
      if (typing || ui.modal || ui.confirm || ui.prompt) return;

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else ed.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        ed.redo();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (mod || e.altKey) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ed.selectedId) {
          e.preventDefault();
          requestDelete(ed.selectedId);
        }
        return;
      }
      if (e.key === 'F2' && ed.selectedId) {
        e.preventDefault();
        startRename(ed.selectedId);
        return;
      }
      if (e.key === 'Escape') {
        const vp = useViewport.getState();
        if (vp.previewMode) vp.setPreviewMode(false);
        else if (ed.tool === 'paint') ed.setTool('select');
        else ed.select(null);
        return;
      }
      if (e.key === '?') {
        ui.openModal('shortcuts');
        return;
      }
      if (e.key === 'Home') {
        useViewport.getState().requestCamera(DEFAULT_CAMERA.position, DEFAULT_CAMERA.target);
        return;
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 5) {
        useViewport.getState().requestCamera(CAMERA_VIEWS[VIEW_KEYS[num - 1]].position, CAMERA_TARGET);
        return;
      }
      switch (key) {
        case 'f':
          focusSelection();
          break;
        case 'v':
          ed.setTool('select');
          break;
        case 'w':
          ed.setTool('move');
          break;
        case 'e':
          ed.setTool('rotate');
          break;
        case 'r':
          ed.setTool('scale');
          break;
        case 'b':
          ed.setTool('paint');
          break;
        case 'g':
          useSettings.getState().set('showGrid', !useSettings.getState().showGrid);
          break;
        case 'x':
          useSettings.getState().set('snap', !useSettings.getState().snap);
          break;
        case 'l':
          useViewport.getState().setLighting(!useViewport.getState().lighting);
          break;
        case 'z':
          useViewport.getState().setWireframe(!useViewport.getState().wireframe);
          break;
        case 'p': {
          const vp = useViewport.getState();
          vp.setPreviewMode(!vp.previewMode);
          if (!vp.previewMode && ed.animation === 'rest') ed.setAnimation('idle');
          break;
        }
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
