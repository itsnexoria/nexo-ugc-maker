import * as THREE from 'three';
import type { TextureAsset } from '../types';

/**
 * Texture cache. One decoded base texture per library asset; each object that uses
 * it gets a cheap clone (shared image, own repeat/offset). Clones are disposed by their owner.
 */
const bases = new Map<string, { url: string; tex: THREE.Texture | null; waiting: Array<(t: THREE.Texture) => void> }>();
const loader = new THREE.TextureLoader();

export function loadBaseTexture(asset: TextureAsset, cb: (t: THREE.Texture) => void): void {
  const hit = bases.get(asset.id);
  if (hit && hit.url === asset.dataUrl) {
    if (hit.tex) cb(hit.tex);
    else hit.waiting.push(cb);
    return;
  }
  const entry = { url: asset.dataUrl, tex: null as THREE.Texture | null, waiting: [cb] };
  bases.set(asset.id, entry);
  loader.load(
    asset.dataUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      entry.tex = tex;
      entry.waiting.splice(0).forEach((fn) => fn(tex));
    },
    undefined,
    () => {
      entry.waiting = [];
    },
  );
}

export function applyTextureTransform(t: THREE.Texture, repeat: [number, number], offset: [number, number], rotationDeg: number) {
  t.repeat.set(repeat[0], repeat[1]);
  t.offset.set(offset[0], offset[1]);
  t.center.set(0.5, 0.5);
  t.rotation = (rotationDeg * Math.PI) / 180;
}
