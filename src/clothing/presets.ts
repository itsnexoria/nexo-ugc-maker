import type { ClothingKind, ClothingLayer, FillLayer, PatternLayer, ShapeLayer, TextLayer } from '../types';
import { uid } from '../utils/ids';
import { clipBounds, panelById } from './templates';

/**
 * Starter designs. Everything is built from ordinary layers, so presets stay fully editable.
 * Coordinates come from the Roblox template panels.
 */
export interface ClothingPreset {
  id: string;
  kind: ClothingKind;
  name: string;
  description: string;
  /** Preview colours for the card swatch */
  swatch: [string, string];
  build: () => ClothingLayer[];
}

const RED = '#e3242b';

function common(name: string, clip: string) {
  return { id: uid('lyr'), name, visible: true, locked: false, opacity: 1, blend: 'normal' as const, clip };
}

const fill = (name: string, color: string, clip = 'all', color2: string | null = null, angle = 90): FillLayer => ({
  ...common(name, clip),
  type: 'fill',
  color,
  color2,
  angle,
});

const pattern = (name: string, p: PatternLayer['pattern'], color: string, color2: string, size: number, opacity = 1, angle = 0, clip = 'all'): PatternLayer => ({
  ...common(name, clip),
  opacity,
  type: 'pattern',
  pattern: p,
  color,
  color2,
  size,
  angle,
});

const rect = (kind: ClothingKind, name: string, clip: string, x: number, y: number, w: number, h: number, color: string, extra: Partial<ShapeLayer> = {}): ShapeLayer => ({
  ...common(name, clip),
  type: 'shape',
  shape: 'rect',
  x,
  y,
  w,
  h,
  rotation: 0,
  fill: color,
  stroke: '#000000',
  strokeWidth: 0,
  radius: 0,
  ...extra,
});

const text = (name: string, clip: string, t: string, x: number, y: number, size: number, color: string, extra: Partial<TextLayer> = {}): TextLayer => ({
  ...common(name, clip),
  type: 'text',
  text: t,
  font: 'Chakra Petch',
  size,
  color,
  bold: true,
  italic: false,
  stroke: '#000000',
  strokeWidth: 0,
  align: 'center',
  x,
  y,
  rotation: 0,
  ...extra,
});

function centre(kind: ClothingKind, id: string) {
  const p = panelById(kind, id);
  if (!p) throw new Error(`Unknown panel ${id}`);
  return { cx: p.x + p.w / 2, cy: p.y + p.h / 2, ...p };
}

/** Horizontal band that wraps around every panel of a body-part group at a given y. */
function band(kind: ClothingKind, name: string, group: string, y: number, h: number, color: string): ShapeLayer {
  const b = clipBounds(kind, group);
  return rect(kind, name, group, b.x + b.w / 2, y + h / 2, b.w, h, color);
}

// ------------------------------------------------------------------ shirts

function cyberJacket(): ClothingLayer[] {
  const front = centre('shirt', 'torso.front');
  const back = centre('shirt', 'torso.back');
  const layers: ClothingLayer[] = [
    fill('Base', '#121317'),
    pattern('Panel grid', 'grid', '#23252c', '#121317', 14, 1),
    rect('shirt', 'Front stripe L', 'torso.front', front.cx - 34, front.cy, 6, 128, RED),
    rect('shirt', 'Front stripe R', 'torso.front', front.cx + 34, front.cy, 6, 128, RED),
    text('Chest logo', 'torso.front', 'NEXO', front.cx + 46, front.y + 30, 11, '#ffffff'),
    text('Back logo', 'torso.back', 'NEXO', back.cx, back.cy - 10, 26, '#ffffff'),
    text('Back sub', 'torso.back', 'BY NEXORIA', back.cx, back.cy + 14, 9, RED),
    band('shirt', 'Torso hem', 'torso', 74 + 114, 14, RED),
    band('shirt', 'Right sleeve band', 'rightArm', 355 + 36, 10, RED),
    band('shirt', 'Left sleeve band', 'leftArm', 355 + 36, 10, RED),
    band('shirt', 'Right cuff', 'rightArm', 355 + 112, 16, '#1c1d22'),
    band('shirt', 'Left cuff', 'leftArm', 355 + 112, 16, '#1c1d22'),
  ];
  return layers;
}

function hoodie(): ClothingLayer[] {
  const front = centre('shirt', 'torso.front');
  return [
    fill('Base', '#5a5d66'),
    pattern('Fabric', 'stripes', '#555861', '#5a5d66', 2, 0.6, 90),
    band('shirt', 'Torso hem', 'torso', 74 + 112, 16, '#3c3e45'),
    band('shirt', 'Right cuff', 'rightArm', 355 + 110, 18, '#3c3e45'),
    band('shirt', 'Left cuff', 'leftArm', 355 + 110, 18, '#3c3e45'),
    rect('shirt', 'Pocket', 'torso.front', front.cx, front.y + 98, 84, 30, '#4e5159', { radius: 6, stroke: '#3c3e45', strokeWidth: 2 }),
    rect('shirt', 'String L', 'torso.front', front.cx - 14, front.y + 22, 3, 30, '#e4e4e8'),
    rect('shirt', 'String R', 'torso.front', front.cx + 14, front.y + 22, 3, 30, '#e4e4e8'),
    band('shirt', 'Collar', 'torso', 74, 8, '#3c3e45'),
  ];
}

function racingTee(): ClothingLayer[] {
  return [
    fill('Base', '#f2f2f4'),
    band('shirt', 'Chest stripe', 'torso', 74 + 34, 18, RED),
    band('shirt', 'Chest stripe line', 'torso', 74 + 56, 4, '#16171b'),
    band('shirt', 'Right sleeve stripe', 'rightArm', 355 + 20, 14, RED),
    band('shirt', 'Left sleeve stripe', 'leftArm', 355 + 20, 14, RED),
    band('shirt', 'Right hem', 'rightArm', 355 + 112, 16, '#16171b'),
    band('shirt', 'Left hem', 'leftArm', 355 + 112, 16, '#16171b'),
  ];
}

function camoShirt(): ClothingLayer[] {
  return [
    fill('Base', '#4b5a34'),
    pattern('Camo', 'camo', '#2c3820', '#6b7a4a', 20, 1, 0),
    band('shirt', 'Right cuff', 'rightArm', 355 + 114, 14, '#2c3820'),
    band('shirt', 'Left cuff', 'leftArm', 355 + 114, 14, '#2c3820'),
  ];
}

// ------------------------------------------------------------------ pants

function jeans(): ClothingLayer[] {
  const frontL = centre('pants', 'rightLeg.front');
  const frontR = centre('pants', 'leftLeg.front');
  const backT = centre('pants', 'torso.back');
  const layers: ClothingLayer[] = [
    fill('Denim', '#2f4b7c'),
    pattern('Denim weave', 'stripes', '#2b4674', '#2f4b7c', 2, 0.7, 90),
    band('pants', 'Belt', 'torso', 74 + 6, 14, '#2a1c12'),
    rect('pants', 'Buckle', 'torso.front', centre('pants', 'torso.front').cx, 74 + 13, 16, 12, '#d7b25a', { strokeWidth: 1.5, stroke: '#8a6d28' }),
    rect('pants', 'Fly stitch', 'torso.front', centre('pants', 'torso.front').cx, 74 + 52, 2, 60, '#c9a45a'),
    rect('pants', 'Back pocket L', 'torso.back', backT.cx - 30, backT.y + 52, 38, 40, '#2f4b7c', { stroke: '#c9a45a', strokeWidth: 1.5, radius: 3 }),
    rect('pants', 'Back pocket R', 'torso.back', backT.cx + 30, backT.y + 52, 38, 40, '#2f4b7c', { stroke: '#c9a45a', strokeWidth: 1.5, radius: 3 }),
  ];
  for (const f of [frontL, frontR]) {
    layers.push(rect('pants', `Knee wear ${f.id}`, f.id, f.cx, f.y + 62, 40, 30, '#4a6aa3', { shape: 'ellipse', opacity: 0.45 }));
  }
  for (const g of ['rightLeg', 'leftLeg']) {
    const b = clipBounds('pants', g);
    layers.push(rect('pants', `${g} hem`, g, b.x + b.w / 2, 355 + 118, b.w, 10, '#3a5a92'));
  }
  return layers;
}

function trackPants(): ClothingLayer[] {
  const layers: ClothingLayer[] = [fill('Base', '#17181c'), band('pants', 'Waistband', 'torso', 74 + 2, 16, '#26272d')];
  const rightOuter = centre('pants', 'rightLeg.right');
  const leftOuter = centre('pants', 'leftLeg.left');
  for (const o of [rightOuter, leftOuter]) {
    layers.push(rect('pants', `Stripe ${o.id}`, o.id, o.cx, o.cy, 16, 128, '#f2f2f4'));
    layers.push(rect('pants', `Stripe edge A ${o.id}`, o.id, o.cx - 12, o.cy, 3, 128, RED));
    layers.push(rect('pants', `Stripe edge B ${o.id}`, o.id, o.cx + 12, o.cy, 3, 128, RED));
  }
  for (const g of ['rightLeg', 'leftLeg']) {
    const b = clipBounds('pants', g);
    layers.push(rect('pants', `${g} cuff`, g, b.x + b.w / 2, 355 + 118, b.w, 10, '#26272d'));
  }
  return layers;
}

function cargo(): ClothingLayer[] {
  const layers: ClothingLayer[] = [fill('Base', '#6d6c4f'), band('pants', 'Belt', 'torso', 74 + 6, 12, '#3b3a2b')];
  for (const id of ['rightLeg.right', 'leftLeg.left']) {
    const p = centre('pants', id);
    layers.push(rect('pants', `Pocket ${id}`, id, p.cx, p.y + 66, 46, 44, '#5f5e44', { stroke: '#44432f', strokeWidth: 2, radius: 3 }));
    layers.push(rect('pants', `Flap ${id}`, id, p.cx, p.y + 50, 46, 14, '#55543c', { stroke: '#44432f', strokeWidth: 2 }));
  }
  return layers;
}

// ------------------------------------------------------------------ t-shirts

function nBadge(): ClothingLayer[] {
  return [
    fill('Background', '#121317'),
    { ...rect('tshirt', 'Hex', 'all', 64, 54, 76, 76, 'none', { shape: 'hexagon', stroke: RED, strokeWidth: 5 }) },
    text('N', 'all', 'N', 64, 56, 54, '#f2f2f4'),
    text('Wordmark', 'all', 'NEXORIA', 64, 108, 16, RED),
  ];
}

function slogan(): ClothingLayer[] {
  return [fill('Background', '#f2f2f4'), text('Line 1', 'all', 'STAY', 64, 46, 40, '#16171b'), text('Line 2', 'all', 'NEXO', 64, 86, 40, RED)];
}

function glowStar(): ClothingLayer[] {
  return [
    fill('Gradient', '#e3242b', 'all', '#16171b', 90),
    rect('tshirt', 'Star', 'all', 64, 62, 78, 78, '#ffffff', { shape: 'star' }),
    text('Caption', 'all', 'SUPERNOVA', 64, 112, 15, '#ffffff'),
  ];
}

export const CLOTHING_PRESETS: ClothingPreset[] = [
  { id: 'shirt-cyber', kind: 'shirt', name: 'Cyber jacket', description: 'Dark jacket, red stripes, wrap-around sleeve bands', swatch: ['#121317', RED], build: cyberJacket },
  { id: 'shirt-hoodie', kind: 'shirt', name: 'Hoodie', description: 'Grey hoodie with pocket, strings and cuffs', swatch: ['#5a5d66', '#3c3e45'], build: hoodie },
  { id: 'shirt-racing', kind: 'shirt', name: 'Racing tee', description: 'White tee with a wrap-around chest stripe', swatch: ['#f2f2f4', RED], build: racingTee },
  { id: 'shirt-camo', kind: 'shirt', name: 'Camo', description: 'Camouflage pattern with cuffs', swatch: ['#4b5a34', '#2c3820'], build: camoShirt },
  { id: 'pants-jeans', kind: 'pants', name: 'Jeans', description: 'Denim with belt, stitching and back pockets', swatch: ['#2f4b7c', '#c9a45a'], build: jeans },
  { id: 'pants-track', kind: 'pants', name: 'Track pants', description: 'Black with white side stripes', swatch: ['#17181c', '#f2f2f4'], build: trackPants },
  { id: 'pants-cargo', kind: 'pants', name: 'Cargo pants', description: 'Olive with leg pockets', swatch: ['#6d6c4f', '#44432f'], build: cargo },
  { id: 'tshirt-badge', kind: 'tshirt', name: 'N badge', description: 'Hexagon badge with wordmark', swatch: ['#121317', RED], build: nBadge },
  { id: 'tshirt-slogan', kind: 'tshirt', name: 'Slogan', description: 'Bold two-line slogan', swatch: ['#f2f2f4', RED], build: slogan },
  { id: 'tshirt-star', kind: 'tshirt', name: 'Supernova', description: 'Gradient with a star', swatch: [RED, '#16171b'], build: glowStar },
];

export function presetsFor(kind: ClothingKind): ClothingPreset[] {
  return CLOTHING_PRESETS.filter((p) => p.kind === kind);
}
