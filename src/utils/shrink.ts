import { useClothing } from '../store/clothing';
import { useEditor } from '../store/editor';
import { serializeCurrentProject } from '../store/serialize';
import { useUI } from '../store/ui';
import { CLOTHING_IMAGE_MAX_DIM, TEXTURE_MAX_DIM, optimizeDataUrl } from './imageOptimize';
import { formatBytes } from './privacy';
import { estimateProjectBytes, useStorageHealth } from './storageHealth';

export interface ShrinkResult {
  count: number;
  savedChars: number;
}

/** Shrinks the open project's textures (accessories) or images (clothing) to the sizes Roblox can actually use. */
export async function shrinkCurrentProjectImages(): Promise<ShrinkResult> {
  const ui = useUI.getState();
  const ed = useEditor.getState();
  let count = 0;
  let savedChars = 0;
  ui.setBusy('Shrinking images…');
  try {
    if (ed.screen === 'clothing') {
      const updates: { id: string; dataUrl: string; width: number; height: number }[] = [];
      for (const img of useClothing.getState().images) {
        const r = await optimizeDataUrl(img.dataUrl, { maxDim: CLOTHING_IMAGE_MAX_DIM, force: true });
        if (r.changed) {
          updates.push({ id: img.id, dataUrl: r.dataUrl, width: r.width, height: r.height });
          savedChars += r.before - r.after;
        }
      }
      count = updates.length;
      if (count) useClothing.getState().replaceImages(updates);
    } else {
      for (const t of useEditor.getState().textures) {
        const r = await optimizeDataUrl(t.dataUrl, { maxDim: TEXTURE_MAX_DIM, force: true });
        if (r.changed) {
          useEditor.getState().replaceTexture(t.id, { dataUrl: r.dataUrl, width: r.width, height: r.height, name: t.name });
          savedChars += r.before - r.after;
          count += 1;
        }
      }
    }
    const s = useEditor.getState();
    if (count) {
      const data = serializeCurrentProject();
      useStorageHealth.getState().setProjectBytes(estimateProjectBytes(data));
      ui.toast('success', `Shrunk ${count} image${count === 1 ? '' : 's'}, saving about ${formatBytes(Math.round(savedChars * 0.73))}.`);
    } else {
      ui.toast('info', 'Everything is already a sensible size.');
    }
    void useStorageHealth.getState().check(true);
    return { count, savedChars };
  } finally {
    ui.setBusy(null);
  }
}
