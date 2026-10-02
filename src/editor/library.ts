import { BUILTIN_TEXTURES, renderBuiltinTexture } from '../assets/textures';
import { applyPresetToMaterial } from '../assets/materials';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { uid } from '../utils/ids';
import type { TextureAsset } from '../types';

const thumbs = new Map<string, string | null>();

export function builtinThumb(id: string): string | null {
  if (!thumbs.has(id)) thumbs.set(id, renderBuiltinTexture(id)?.dataUrl ?? null);
  return thumbs.get(id) ?? null;
}

/** Adds a built-in texture to the project library (once) and optionally applies it to the selection. */
export function addBuiltinTexture(id: string, apply = true): TextureAsset | null {
  const def = BUILTIN_TEXTURES.find((t) => t.id === id);
  const ui = useUI.getState();
  const ed = useEditor.getState();
  if (!def) return null;
  let asset = ed.textures.find((t) => t.source === 'builtin' && t.name === def.name);
  if (!asset) {
    const r = renderBuiltinTexture(id);
    if (!r) {
      ui.toast('error', 'Could not draw the texture in this browser.');
      return null;
    }
    asset = { id: uid('tex'), name: def.name, dataUrl: r.dataUrl, width: r.width, height: r.height, source: 'builtin', createdAt: Date.now() };
    ed.addTexture(asset);
  }
  const sel = apply && ed.selectedId ? ed.objects[ed.selectedId] : null;
  if (sel && sel.kind !== 'group') {
    ed.setMaterial(sel.id, { textureId: asset.id, color: '#ffffff' });
    ui.toast('success', `Applied "${def.name}" to ${sel.name}`);
  } else {
    ui.toast('success', `Added "${def.name}" to the texture library`);
  }
  return asset;
}

export function applyMaterialPresetToSelection(presetId: string): void {
  const ed = useEditor.getState();
  const sel = ed.selectedId ? ed.objects[ed.selectedId] : null;
  if (!sel || sel.kind === 'group') {
    useUI.getState().toast('warn', 'Select a part first, then pick a material.');
    return;
  }
  ed.applyMaterialPreset(sel.id, presetId);
}

export { applyPresetToMaterial };
