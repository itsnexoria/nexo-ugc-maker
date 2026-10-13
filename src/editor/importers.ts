import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { geometryToModelAsset, triangleCount } from '../utils/geometry';
import { MODEL_EXTENSIONS, SIDECAR_EXTENSIONS, extOf, loadModelFiles, normaliseParts, textureToDataUrl } from './modelImport';
import { uid } from '../utils/ids';
import type { TextureAsset } from '../types';
import { CLOTHING_IMAGE_MAX_DIM, TEXTURE_MAX_DIM, optimizeDataUrl } from '../utils/imageOptimize';

const MAX_TEXTURE_BYTES = 12 * 1024 * 1024;
const MAX_MODEL_BYTES = 40 * 1024 * 1024;

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

export function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('This image could not be decoded.'));
    img.src = dataUrl;
  });
}

export type LoadedTexture = Omit<TextureAsset, 'id' | 'createdAt' | 'source'> & { shrunkFrom?: { width: number; height: number } };

/** Reads an image file as a texture. Anything over Roblox's 1024 px limit is scaled down so it is stored (and exported) at a usable size. */
export async function textureFromFile(file: File): Promise<LoadedTexture> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(`"${file.name}" is not a PNG, JPG or WebP image.`);
  if (file.size > MAX_TEXTURE_BYTES) throw new Error(`"${file.name}" is larger than 12 MB.`);
  const raw = await readAsDataUrl(file);
  const { width, height } = await imageSize(raw);
  const name = file.name.replace(/\.[^.]+$/, '');
  const opt = await optimizeDataUrl(raw, { maxDim: TEXTURE_MAX_DIM });
  if (!opt.changed) return { name, dataUrl: raw, width, height };
  const scaled = opt.width !== width || opt.height !== height;
  return { name, dataUrl: opt.dataUrl, width: opt.width, height: opt.height, ...(scaled ? { shrunkFrom: { width, height } } : {}) };
}

/** Adds an uploaded image to the project's texture library. */
export async function uploadTexture(file: File, applyToSelected = true): Promise<TextureAsset | null> {
  const ui = useUI.getState();
  try {
    ui.setBusy('Loading texture…');
    const { shrunkFrom, ...t } = await textureFromFile(file);
    const asset: TextureAsset = { ...t, id: uid('tex'), source: 'upload', createdAt: Date.now() };
    const ed = useEditor.getState();
    ed.addTexture(asset);
    const sel = ed.selectedId ? ed.objects[ed.selectedId] : null;
    if (applyToSelected && sel && sel.kind !== 'group') {
      ed.setMaterial(sel.id, { textureId: asset.id, color: '#ffffff' }, undefined);
      ui.toast('success', `Texture "${asset.name}" added and applied to ${sel.name}`);
    } else {
      ui.toast('success', `Texture "${asset.name}" added to the library (${asset.width}×${asset.height})`);
    }
    if (shrunkFrom) ui.toast('info', `"${asset.name}" was ${shrunkFrom.width}×${shrunkFrom.height}. Scaled to ${asset.width}×${asset.height}, Roblox's maximum.`);
    return asset;
  } catch (err) {
    ui.toast('error', err instanceof Error ? err.message : 'Texture upload failed.');
    return null;
  } finally {
    useUI.getState().setBusy(null);
  }
}

export async function importModelFile(file: File): Promise<boolean> {
  return importModelFiles([file]);
}

/**
 * Imports a model together with the files it needs (an OBJ's .mtl, a glTF's .bin, texture pictures).
 * Each material becomes its own part, keeping its colour, finish and texture.
 */
export async function importModelFiles(files: File[]): Promise<boolean> {
  const ui = useUI.getState();
  try {
    const model = files.find((f) => MODEL_EXTENSIONS.includes(extOf(f.name)));
    if (!model) throw new Error(`${files[0] ? `"${files[0].name}" is not a supported model. ` : ''}Use .obj, .glb or .gltf.`);
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > MAX_MODEL_BYTES) throw new Error(`These files add up to more than 40 MB.`);
    ui.setBusy(`Importing ${model.name}…`);
    const loaded = await loadModelFiles(files);
    const { scaled, factor } = normaliseParts(loaded.parts);
    const tris = loaded.parts.reduce((n, p) => n + triangleCount(p.geometry), 0);
    if (tris > 200_000) throw new Error(`This mesh has ${tris.toLocaleString()} triangles, which is too heavy for the browser editor.`);

    // decode each distinct picture once and share it between the parts that use it
    const textureByMap = new Map<unknown, TextureAsset>();
    const textures: TextureAsset[] = [];
    for (const p of loaded.parts) {
      if (!p.map) continue;
      let asset = textureByMap.get(p.map);
      if (!asset) {
        const img = await textureToDataUrl(p.map);
        if (!img) continue;
        asset = { id: uid('tex'), name: p.name, dataUrl: img.dataUrl, width: img.width, height: img.height, source: 'upload', createdAt: Date.now() };
        textureByMap.set(p.map, asset);
        textures.push(asset);
      }
      p.material.textureId = asset.id;
    }
    const parts = loaded.parts.map((p) => ({ model: geometryToModelAsset(uid('model'), p.name, p.geometry), name: p.name, material: p.material }));
    loaded.parts.forEach((p) => p.geometry.dispose());
    useEditor.getState().addImportedParts(loaded.name, parts, textures);

    const note = [
      parts.length > 1 ? `${parts.length} materials` : null,
      textures.length ? `${textures.length} texture${textures.length === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    ui.toast('success', `Imported "${loaded.name}" (${tris.toLocaleString()} triangles${note.length ? `, ${note.join(', ')} kept` : ''})${scaled ? `, scaled by ${factor.toFixed(3)} to fit the avatar` : ''}`);
    if (loaded.missingTextures.length) ui.toast('warn', `The model refers to ${loaded.missingTextures.slice(0, 3).join(', ')}${loaded.missingTextures.length > 3 ? ' …' : ''}, which was not selected. Pick the picture files together with the model to keep its textures.`);
    if (tris > 4000) ui.toast('warn', 'Over 4,000 triangles. Check the Validation tab before exporting.');
    return true;
  } catch (err) {
    ui.toast('error', err instanceof Error ? err.message : 'Model import failed.');
    return false;
  } finally {
    useUI.getState().setBusy(null);
  }
}

/** Opens a native file picker and resolves with the chosen files. */
export const MODEL_ACCEPT = '.obj,.glb,.gltf,.mtl,.bin,image/png,image/jpeg,image/webp';

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export async function handleDroppedFiles(files: File[]): Promise<void> {
  if (useEditor.getState().screen === 'clothing') {
    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        useUI.getState().toast('warn', `"${f.name}" isn't an image.`);
        continue;
      }
      const kind = useClothing.getState().activeKind;
      const spec = TEMPLATES[kind];
      let looksLikeTemplate = false;
      try {
        // measure without reading the whole file into a data URL (it is read once more by the import itself)
        const size = typeof createImageBitmap === 'function' ? await createImageBitmap(f).then((b) => (b.close(), { width: b.width, height: b.height })) : await imageSize(await readAsDataUrl(f));
        looksLikeTemplate = kind !== 'tshirt' && size.width === spec.width && size.height === spec.height;
      } catch {
        /* handled by the upload below */
      }
      if (looksLikeTemplate) await importClothingTemplate(f);
      else await uploadClothingImage(f, true);
    }
    return;
  }
  // a model dropped together with its .mtl, .bin and pictures is imported as one thing
  if (files.some((f) => MODEL_EXTENSIONS.includes(extOf(f.name)))) {
    const models = files.filter((f) => MODEL_EXTENSIONS.includes(extOf(f.name)));
    const rest = files.filter((f) => !MODEL_EXTENSIONS.includes(extOf(f.name)));
    for (const m of models) await importModelFiles([m, ...(models.length === 1 ? rest : [])]);
    return;
  }
  for (const f of files) {
    if (SIDECAR_EXTENSIONS.includes(extOf(f.name))) useUI.getState().toast('warn', `"${f.name}" belongs to a model. Drop it together with the .obj or .gltf file.`);
    else if (f.type.startsWith('image/')) await uploadTexture(f);
    else useUI.getState().toast('warn', `"${f.name}" isn't a supported file. Drop a .obj, .glb, .gltf or image.`);
  }
}

// ------------------------------------------------------------------ clothing images

import { useClothing } from '../store/clothing';
import type { ClothingImage } from '../types';
import { TEMPLATES } from '../clothing/templates';

/** Adds an uploaded picture to the clothing image library, and optionally places it as a layer. */
export async function uploadClothingImage(file: File, asLayer = true, quiet = false): Promise<ClothingImage | null> {
  const ui = useUI.getState();
  try {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error(`"${file.name}" is not a PNG, JPG, WebP or GIF image.`);
    if (file.size > MAX_TEXTURE_BYTES) throw new Error(`"${file.name}" is larger than 12 MB.`);
    ui.setBusy('Loading image…');
    const raw = await readAsDataUrl(file);
    const natural = await imageSize(raw);
    // pictures far bigger than the template are scaled down: layers are drawn at template size anyway
    const opt = await optimizeDataUrl(raw, { maxDim: CLOTHING_IMAGE_MAX_DIM });
    const { dataUrl, width, height } = opt.changed ? opt : { dataUrl: raw, ...natural };
    const img: ClothingImage = { id: uid('img'), name: file.name.replace(/\.[^.]+$/, ''), dataUrl, width, height };
    const cl = useClothing.getState();
    cl.addImage(img);
    if (asLayer) cl.addLayer('image', { image: img });
    if (!quiet) {
      const shrunk = width !== natural.width || height !== natural.height;
      ui.toast('success', shrunk ? `Added "${img.name}" (scaled from ${natural.width}×${natural.height} to ${width}×${height})` : `Added "${img.name}" (${width}×${height})`);
    }
    return img;
  } catch (err) {
    ui.toast('error', err instanceof Error ? err.message : 'Image upload failed.');
    return null;
  } finally {
    useUI.getState().setBusy(null);
  }
}

/**
 * Imports an existing shirt/pants/T-shirt PNG as the bottom layer of the active design.
 * A file that already matches the Roblox template size is placed 1:1; anything else is scaled to fit.
 */
export async function importClothingTemplate(file: File): Promise<boolean> {
  const ui = useUI.getState();
  try {
    const img = await uploadClothingImage(file, false, true);
    if (!img) return false;
    const cl = useClothing.getState();
    const spec = TEMPLATES[cl.activeKind];
    const exact = cl.activeKind === 'tshirt' ? img.width === img.height : img.width === spec.width && img.height === spec.height;
    cl.addBaseImage(img, exact && cl.activeKind !== 'tshirt' ? 'exact' : 'contain');
    if (exact) ui.toast('success', `Imported "${img.name}" at ${img.width}×${img.height}. It matches the ${spec.label.toLowerCase()} template, so every panel lines up.`);
    else ui.toast('warn', `"${img.name}" is ${img.width}×${img.height}, not ${spec.width}×${spec.height}. It was scaled to fit, so panels may not line up. Check the guides.`);
    return true;
  } catch (err) {
    ui.toast('error', err instanceof Error ? err.message : 'Import failed.');
    return false;
  }
}
