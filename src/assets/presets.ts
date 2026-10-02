import { darken } from './materials';
import type { AssetCategory, MaterialProps, PartSpec, SlotId, Vec3 } from '../types';

/**
 * Accessory presets. Every preset is a tree of real primitives; coordinates are
 * relative to the slot's attachment point on the avatar (see SLOT_ANCHORS).
 * Sizes are in studs.
 */
export interface AssetDef {
  id: string;
  name: string;
  category: AssetCategory;
  slot: SlotId;
  description: string;
  build: () => PartSpec;
}

const RED = '#e3242b';
const DARK = '#2a2c33';
const STEEL = '#9aa0ab';
const GOLD = '#ffc43a';

type M = Partial<MaterialProps>;
const plastic = (color: string, extra: M = {}): M => ({ color, metalness: 0, roughness: 0.45, preset: 'plastic', ...extra });
const metal = (color: string, extra: M = {}): M => ({ color, metalness: 1, roughness: 0.35, preset: 'metal', ...extra });
const gold: M = { color: GOLD, metalness: 1, roughness: 0.22, preset: 'gold' };
const glow = (color: string, intensity = 2.2): M => ({ color: darken(color, 0.3), emissive: color, emissiveIntensity: Math.round(intensity * 0.55 * 100) / 100, roughness: 0.5, preset: 'neon' });

const root = (name: string, slot: SlotId, children: PartSpec[]): PartSpec => ({ name, kind: 'group', slot, children });

const part = (name: string, kind: PartSpec['kind'], position: Vec3, scale: Vec3, material: M, extra: Partial<PartSpec> = {}): PartSpec => ({
  name,
  kind,
  position,
  scale,
  material,
  ...extra,
});

const deg = (n: number) => (n * Math.PI) / 180;

// ---------------------------------------------------------------- hats

function basicHat(): PartSpec {
  return root('Hat', 'hat', [
    part('Brim', 'cylinder', [0, 0.06, 0], [2.1, 0.12, 2.1], plastic(DARK)),
    part('Crown', 'cylinder', [0, 0.52, 0], [1.45, 0.8, 1.45], plastic(DARK)),
    part('Band', 'cylinder', [0, 0.22, 0], [1.5, 0.16, 1.5], plastic(RED), { layer: 'details' }),
  ]);
}

function topHat(): PartSpec {
  return root('Top Hat', 'hat', [
    part('Brim', 'cylinder', [0, 0.05, 0], [2.0, 0.1, 2.0], plastic('#1a1b1f')),
    part('Cylinder', 'cylinder', [0, 0.75, 0], [1.3, 1.3, 1.3], plastic('#1a1b1f')),
    part('Band', 'cylinder', [0, 0.25, 0], [1.34, 0.22, 1.34], plastic(RED), { layer: 'details' }),
  ]);
}

function crown(): PartSpec {
  const kids: PartSpec[] = [part('Ring', 'cylinder', [0, 0.2, 0], [1.6, 0.4, 1.6], gold)];
  for (let i = 0; i < 5; i++) {
    const a = deg(i * 72);
    const x = Math.sin(a) * 0.62;
    const z = Math.cos(a) * 0.62;
    kids.push(part(`Spike ${i + 1}`, 'cone', [x, 0.72, z], [0.34, 0.7, 0.34], gold));
    kids.push(part(`Gem ${i + 1}`, 'icosphere', [x, 1.1, z], [0.16, 0.16, 0.16], glow(RED, 1.2), { layer: 'glow' }));
  }
  return root('Crown', 'hat', kids);
}

function horns(): PartSpec {
  const kids: PartSpec[] = [];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'Left' : 'Right';
    kids.push(part(`${side} Base`, 'cylinder', [s * 0.45, 0.08, 0], [0.42, 0.16, 0.42], plastic('#3a3c44')));
    kids.push(part(`${side} Horn`, 'cone', [s * 0.62, 0.62, 0], [0.34, 1.0, 0.34], plastic('#e9e2cf'), { rotation: [0, 0, -s * 28] }));
  }
  return root('Horns', 'hat', kids);
}

function halo(): PartSpec {
  return root('Halo', 'hat', [part('Ring', 'torus', [0, 0.95, 0], [1.6, 0.6, 1.6], glow(GOLD, 1.8), { layer: 'glow' })]);
}

// ---------------------------------------------------------------- hair

function spikyHair(): PartSpec {
  const kids: PartSpec[] = [part('Cap', 'sphere', [0, -0.05, 0], [1.4, 1.0, 1.4], plastic('#1d1e24'))];
  const spikes: [number, number, number, number][] = [
    [0, 0.55, 0, 0],
    [0.4, 0.4, 0, 28],
    [-0.4, 0.4, 0, -28],
    [0, 0.4, -0.42, 0],
    [0, 0.4, 0.42, 0],
  ];
  spikes.forEach(([x, y, z, rz], i) => {
    const tiltX = z < 0 ? -26 : z > 0 ? 26 : 0;
    kids.push(part(`Spike ${i + 1}`, 'cone', [x, y + 0.2, z], [0.4, 0.8, 0.4], plastic('#1d1e24'), { rotation: [tiltX, 0, -rz] }));
  });
  return root('Spiky Hair', 'hair', kids);
}

function mohawk(): PartSpec {
  const kids: PartSpec[] = [part('Cap', 'sphere', [0, -0.05, 0], [1.35, 0.9, 1.35], plastic('#1d1e24'))];
  for (let i = 0; i < 5; i++) {
    const z = -0.5 + i * 0.25;
    kids.push(part(`Fin ${i + 1}`, 'cone', [0, 0.55, z], [0.22, 0.75 - Math.abs(z) * 0.3, 0.34], plastic(RED)));
  }
  return root('Mohawk', 'hair', kids);
}

function hairBun(): PartSpec {
  return root('Hair Bun', 'hair', [
    part('Cap', 'sphere', [0, -0.05, 0], [1.4, 1.0, 1.4], plastic('#5a3b2a')),
    part('Bun', 'sphere', [0, 0.5, 0.1], [0.65, 0.65, 0.65], plastic('#5a3b2a')),
    part('Tie', 'torus', [0, 0.28, 0.1], [0.55, 0.7, 0.55], plastic(RED), { layer: 'details' }),
  ]);
}

// ---------------------------------------------------------------- face

function glasses(): PartSpec {
  const kids: PartSpec[] = [part('Bridge', 'cube', [0, 0.1, -0.03], [0.14, 0.05, 0.06], plastic('#16171b'))];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'Left' : 'Right';
    kids.push(part(`${side} Frame`, 'torus', [s * 0.33, 0.08, -0.03], [0.56, 0.4, 0.56], plastic('#16171b'), { rotation: [90, 0, 0] }));
    kids.push(
      part(`${side} Lens`, 'cylinder', [s * 0.33, 0.08, -0.03], [0.44, 0.02, 0.44], { color: '#ff5560', opacity: 0.35, roughness: 0.05, preset: 'glass' }, {
        rotation: [90, 0, 0],
        layer: 'details',
      }),
    );
    kids.push(part(`${side} Arm`, 'cube', [s * 0.6, 0.08, 0.3], [0.04, 0.04, 0.66], plastic('#16171b')));
  }
  return root('Glasses', 'face', kids);
}

function visor(): PartSpec {
  return root('Visor', 'face', [
    part('Lens', 'cube', [0, 0.08, -0.05], [1.3, 0.38, 0.08], { color: '#ff2d38', opacity: 0.45, roughness: 0.05, emissive: '#ff2d38', emissiveIntensity: 0.6 }),
    part('Frame Top', 'cube', [0, 0.3, -0.05], [1.38, 0.06, 0.12], metal('#1f2025')),
    part('Frame Bottom', 'cube', [0, -0.14, -0.05], [1.38, 0.06, 0.12], metal('#1f2025')),
    part('Strap', 'cube', [0, 0.08, 0.3], [1.3, 0.16, 0.7], plastic('#1f2025')),
  ]);
}

// ---------------------------------------------------------------- back

function backpack(): PartSpec {
  return root('Backpack', 'back', [
    part('Body', 'cube', [0, -0.1, 0.32], [1.3, 1.5, 0.55], plastic('#3b3e48')),
    part('Pocket', 'cube', [0, -0.5, 0.66], [1.0, 0.5, 0.2], plastic('#2c2e36')),
    part('Flap', 'cube', [0, 0.52, 0.34], [1.34, 0.22, 0.6], plastic(RED), { layer: 'details' }),
    part('Left Strap', 'cube', [-0.5, -0.05, 0.02], [0.16, 1.4, 0.06], plastic('#1d1e24')),
    part('Right Strap', 'cube', [0.5, -0.05, 0.02], [0.16, 1.4, 0.06], plastic('#1d1e24')),
  ]);
}

function wings(): PartSpec {
  const kids: PartSpec[] = [];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'Left' : 'Right';
    for (let i = 0; i < 4; i++) {
      const a = deg(30 + i * 20);
      const len = 2.0 - i * 0.28;
      kids.push(
        part(
          `${side} Feather ${i + 1}`,
          'cone',
          [s * (0.4 + (Math.sin(a) * len) / 2), 0.5 + (Math.cos(a) * len) / 2, 0.32 + i * 0.02],
          [0.34, len, 0.1],
          i % 2 ? plastic('#e8eaf0') : metal('#c6cad4'),
          { rotation: [0, 0, -s * (30 + i * 20)] },
        ),
      );
    }
  }
  return root('Wings', 'back', kids);
}

// ---------------------------------------------------------------- shoulder

function shoulderPet(): PartSpec {
  const kids: PartSpec[] = [
    part('Body', 'sphere', [0, 0.32, 0], [0.7, 0.55, 0.7], plastic('#2b2d35')),
    part('Head', 'sphere', [0, 0.72, -0.1], [0.5, 0.45, 0.5], plastic('#2b2d35')),
    part('Tail', 'sphere', [0, 0.3, 0.4], [0.2, 0.2, 0.2], plastic(RED)),
  ];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'Left' : 'Right';
    kids.push(part(`${side} Ear`, 'cone', [s * 0.17, 1.02, -0.1], [0.15, 0.3, 0.12], plastic('#2b2d35')));
    kids.push(part(`${side} Eye`, 'icosphere', [s * 0.1, 0.77, -0.33], [0.08, 0.08, 0.08], glow(RED, 3), { layer: 'glow' }));
  }
  return root('Shoulder Pet', 'shoulder', kids);
}

function shoulderPads(): PartSpec {
  const kids: PartSpec[] = [part('Pad', 'sphere', [0, 0.1, 0], [1.2, 0.6, 1.2], metal('#555a66'))];
  for (let i = 0; i < 3; i++) {
    kids.push(part(`Spike ${i + 1}`, 'cone', [(i - 1) * 0.3, 0.45, 0], [0.2, 0.5, 0.2], metal(STEEL), { rotation: [0, 0, -(i - 1) * 18] }));
  }
  return root('Shoulder Pads', 'shoulder', kids);
}

// ---------------------------------------------------------------- waist

function belt(): PartSpec {
  return root('Belt', 'waist', [
    part('Strap', 'torus', [0, 0, 0], [2.1, 0.6, 1.1], plastic('#1d1e24')),
    part('Buckle', 'cube', [0, 0, -0.58], [0.4, 0.32, 0.1], gold),
    part('Left Pouch', 'cube', [-0.85, -0.1, -0.1], [0.4, 0.5, 0.5], plastic('#2c2e36')),
    part('Right Pouch', 'cube', [0.85, -0.1, -0.1], [0.4, 0.5, 0.5], plastic('#2c2e36')),
  ]);
}

function tail(): PartSpec {
  const kids: PartSpec[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const s = 0.5 - t * 0.28;
    kids.push(part(`Segment ${i + 1}`, 'icosphere', [0, 0.1 + t * t * 1.2, 0.55 + t * 0.6], [s, s, s], i === 5 ? glow(RED, 1.8) : plastic('#2b2d35'), i === 5 ? { layer: 'glow' } : {}));
  }
  return root('Tail', 'waist', kids);
}

// ---------------------------------------------------------------- accessories

function headphones(): PartSpec {
  const kids: PartSpec[] = [part('Band', 'arch', [0, -0.6, 0], [1.5, 1.5, 0.4], metal('#25262c'))];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'Left' : 'Right';
    kids.push(part(`${side} Cup`, 'cylinder', [s * 0.72, -0.6, 0], [0.7, 0.3, 0.7], plastic('#25262c'), { rotation: [0, 0, 90] }));
    kids.push(part(`${side} Pad`, 'cylinder', [s * 0.58, -0.6, 0], [0.58, 0.12, 0.58], plastic('#3b3e48'), { rotation: [0, 0, 90] }));
    kids.push(part(`${side} Light`, 'cylinder', [s * 0.89, -0.6, 0], [0.34, 0.04, 0.34], glow(RED, 2.4), { rotation: [0, 0, 90], layer: 'glow' }));
  }
  return root('Headphones', 'hat', kids);
}

function antenna(): PartSpec {
  return root('Antenna', 'hat', [
    part('Base', 'cylinder', [0.3, 0.06, 0], [0.4, 0.12, 0.4], metal('#555a66')),
    part('Stalk', 'cylinder', [0.3, 0.55, 0], [0.07, 0.9, 0.07], metal(STEEL)),
    part('Tip', 'icosphere', [0.3, 1.05, 0], [0.22, 0.22, 0.22], glow(RED, 2.6), { layer: 'glow' }),
  ]);
}

export const ASSETS: AssetDef[] = [
  { id: 'hat-basic', name: 'Hat', category: 'hats', slot: 'hat', description: 'Brim, crown and a red band', build: basicHat },
  { id: 'hat-crown', name: 'Crown', category: 'hats', slot: 'hat', description: 'Gold ring with five jeweled spikes', build: crown },
  { id: 'hat-horns', name: 'Horns', category: 'hats', slot: 'hat', description: 'Two curved horns on small bases', build: horns },
  { id: 'hat-top', name: 'Top Hat', category: 'hats', slot: 'hat', description: 'Tall formal hat', build: topHat },
  { id: 'hat-halo', name: 'Halo', category: 'hats', slot: 'hat', description: 'Glowing ring above the head', build: halo },
  { id: 'hair-spiky', name: 'Spiky Hair', category: 'hair', slot: 'hair', description: 'Cap with five cone spikes', build: spikyHair },
  { id: 'hair-mohawk', name: 'Mohawk', category: 'hair', slot: 'hair', description: 'Row of red fins', build: mohawk },
  { id: 'hair-bun', name: 'Hair Bun', category: 'hair', slot: 'hair', description: 'Cap with a tied bun', build: hairBun },
  { id: 'face-glasses', name: 'Glasses', category: 'face', slot: 'face', description: 'Round frames with tinted lenses', build: glasses },
  { id: 'face-visor', name: 'Visor', category: 'face', slot: 'face', description: 'Wraparound tinted visor', build: visor },
  { id: 'back-pack', name: 'Backpack', category: 'back', slot: 'back', description: 'Pack with pocket and straps', build: backpack },
  { id: 'back-wings', name: 'Wings', category: 'back', slot: 'back', description: 'Two swept feather wings', build: wings },
  { id: 'shoulder-pet', name: 'Shoulder Pet', category: 'shoulder', slot: 'shoulder', description: 'Small creature with glowing eyes', build: shoulderPet },
  { id: 'shoulder-pads', name: 'Shoulder Pads', category: 'shoulder', slot: 'shoulder', description: 'Armoured pad with spikes', build: shoulderPads },
  { id: 'waist-belt', name: 'Belt', category: 'waist', slot: 'waist', description: 'Belt with buckle and pouches', build: belt },
  { id: 'waist-tail', name: 'Tail', category: 'waist', slot: 'waist', description: 'Segmented tail with glowing tip', build: tail },
  { id: 'acc-headphones', name: 'Headphones', category: 'accessories', slot: 'hat', description: 'Band, ear cups and light rings', build: headphones },
  { id: 'acc-antenna', name: 'Antenna', category: 'accessories', slot: 'hat', description: 'Side antenna with glowing tip', build: antenna },
];

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  hats: 'Hats',
  hair: 'Hair',
  face: 'Face',
  back: 'Back',
  shoulder: 'Shoulder',
  waist: 'Waist',
  accessories: 'Accessories',
  materials: 'Materials',
  textures: 'Textures',
};

export const CATEGORY_ORDER: AssetCategory[] = ['hats', 'hair', 'face', 'back', 'shoulder', 'waist', 'accessories', 'materials', 'textures'];

export const ACCESSORY_CATEGORIES: AssetCategory[] = CATEGORY_ORDER.filter((c) => c !== 'materials' && c !== 'textures');

export function findAsset(id: string): AssetDef | undefined {
  return ASSETS.find((a) => a.id === id);
}
