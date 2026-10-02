import type { Layer, PartSpec, ProjectData, TextureAsset } from '../types';
import { DEFAULT_CAMERA } from '../store/viewport';
import { SLOT_ANCHORS } from './avatar';
import { findAsset } from './presets';
import { darken } from './materials';
import { renderBuiltinTexture } from './textures';
import { uid } from '../utils/ids';
import { DEFAULT_LAYERS, instantiate } from '../utils/scene';

export const EXAMPLE_TEXTURE_NAME = 'Circuit panel (example)';

/** Creates the example texture used by the Cyber Crown sample. Null when canvas is unavailable. */
export function makeExampleTexture(): TextureAsset | null {
  const t = renderBuiltinTexture('circuit');
  if (!t) return null;
  return {
    id: uid('tex'),
    name: EXAMPLE_TEXTURE_NAME,
    dataUrl: t.dataUrl,
    width: t.width,
    height: t.height,
    source: 'builtin',
    createdAt: Date.now(),
  };
}

const RED = '#ff2d38';

function cyberCrownSpec(textureId: string | null): PartSpec {
  const dark = { color: '#d3d7e0', metalness: 0.85, roughness: 0.32, preset: 'metal' };
  const chrome = { color: '#eceef2', metalness: 1, roughness: 0.08, preset: 'chrome' };
  const glow = (i = 3) => ({ color: darken(RED, 0.3), emissive: RED, emissiveIntensity: Math.round(i * 0.5 * 100) / 100, roughness: 0.5, preset: 'neon' });
  const kids: PartSpec[] = [
    {
      name: 'Base Ring',
      kind: 'cylinder',
      position: [0, 0.16, 0],
      scale: [1.7, 0.32, 1.7],
      material: { ...dark, textureId, texRepeat: [4, 1] },
    },
    { name: 'Neon Ring Low', kind: 'torus', position: [0, 0.02, 0], scale: [1.74, 0.3, 1.74], material: glow(2.4), layer: 'glow' },
    { name: 'Neon Ring High', kind: 'torus', position: [0, 0.33, 0], scale: [1.68, 0.3, 1.68], material: glow(2.4), layer: 'glow' },
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 * Math.PI) / 180;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    const tilt = 7;
    kids.push({
      name: `Spike ${i + 1}`,
      kind: 'cone',
      position: [sx * 0.6, 0.77, cz * 0.6],
      rotation: [cz * tilt, 0, -sx * tilt],
      scale: [0.36, 0.9, 0.36],
      material: chrome,
    });
    kids.push({
      name: `Tip ${i + 1}`,
      kind: 'icosphere',
      position: [sx * 0.66, 1.27, cz * 0.66],
      scale: [0.2, 0.2, 0.2],
      material: glow(3.2),
      layer: 'glow',
    });
  }
  kids.push(
    { name: 'Front Plate', kind: 'cube', position: [0, 0.2, -0.86], scale: [0.62, 0.36, 0.1], material: dark, layer: 'details' },
    { name: 'Core Gem', kind: 'icosphere', position: [0, 0.2, -0.95], scale: [0.34, 0.34, 0.2], material: glow(2.8), layer: 'glow' },
    { name: 'Side Fin Left', kind: 'wedge', position: [-0.9, 0.5, 0], rotation: [0, -90, 0], scale: [0.6, 0.6, 0.1], material: chrome, layer: 'details' },
    { name: 'Side Fin Right', kind: 'wedge', position: [0.9, 0.5, 0], rotation: [0, 90, 0], scale: [0.6, 0.6, 0.1], material: chrome, layer: 'details' },
  );
  return { name: 'Cyber Crown', kind: 'group', slot: 'hat', children: kids };
}

function emptyData(): ProjectData {
  return {
    version: 1,
    objects: {},
    order: [],
    layers: DEFAULT_LAYERS.map((l: Layer) => ({ ...l })),
    textures: [],
    models: {},
    rig: 'R6',
    camera: { position: [...DEFAULT_CAMERA.position], target: [...DEFAULT_CAMERA.target] },
  };
}

export type ProjectTemplate = 'blank' | 'cyber-crown' | 'hat';

export const TEMPLATES: { id: ProjectTemplate; name: string; description: string }[] = [
  { id: 'blank', name: 'Blank', description: 'Just the avatar. Add parts and presets yourself.' },
  { id: 'cyber-crown', name: 'Cyber Crown', description: 'Chrome crown with red glow accents and a circuit texture.' },
  { id: 'hat', name: 'Hat starter', description: 'A simple hat to modify.' },
];

export function buildProject(template: ProjectTemplate): ProjectData {
  const data = emptyData();
  const out = { objects: data.objects, order: data.order };
  if (template === 'cyber-crown') {
    const tex = makeExampleTexture();
    if (tex) data.textures.push(tex);
    instantiate(cyberCrownSpec(tex?.id ?? null), null, data.layers, out, SLOT_ANCHORS.R6.hat);
  } else if (template === 'hat') {
    const def = findAsset('hat-basic');
    if (def) instantiate(def.build(), null, data.layers, out, SLOT_ANCHORS.R6.hat);
  }
  return data;
}
