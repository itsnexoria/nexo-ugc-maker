import type { ClothingKind } from '../types';

/**
 * Roblox classic clothing template geometry (585 x 559 px).
 * Panel sizes come from Roblox's Creator Docs (128x128 front/back, 64x128 sides,
 * 128x64 torso top/bottom, 64x64 limb ends). Positions come from the Roblox
 * DevForum UV tables. Face names follow Roblox NormalIds: Front = -Z, Right = +X.
 */
export type PartId = 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg' | 'chest';
export type FaceId = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';

export interface Panel {
  id: string;
  label: string;
  part: PartId;
  face: FaceId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClipOption {
  id: string;
  label: string;
}

export interface TemplateSpec {
  kind: ClothingKind;
  label: string;
  /** Roblox canvas size in template pixels */
  width: number;
  height: number;
  /** Internal render scale (T-shirts are drawn at higher resolution and downsampled on export) */
  scale: number;
  panels: Panel[];
  groups: { id: PartId; label: string }[];
  note: string;
}

const FACES: FaceId[] = ['front', 'back', 'right', 'left', 'top', 'bottom'];
const FACE_LABEL: Record<FaceId, string> = { front: 'Front', back: 'Back', right: 'Right side', left: 'Left side', top: 'Top', bottom: 'Bottom' };

const TORSO_RECTS: Record<FaceId, [number, number, number, number]> = {
  front: [231, 74, 128, 128],
  back: [427, 74, 128, 128],
  right: [165, 74, 64, 128],
  left: [361, 74, 64, 128],
  top: [231, 8, 128, 64],
  bottom: [231, 204, 128, 64],
};
const RIGHT_LIMB_RECTS: Record<FaceId, [number, number, number, number]> = {
  front: [217, 355, 64, 128],
  back: [85, 355, 64, 128],
  right: [151, 355, 64, 128],
  left: [19, 355, 64, 128],
  top: [217, 289, 64, 64],
  bottom: [217, 485, 64, 64],
};
const LEFT_LIMB_RECTS: Record<FaceId, [number, number, number, number]> = {
  front: [308, 355, 64, 128],
  back: [440, 355, 64, 128],
  right: [506, 355, 64, 128],
  left: [374, 355, 64, 128],
  top: [308, 289, 64, 64],
  bottom: [308, 485, 64, 64],
};

function panelsFor(part: PartId, partLabel: string, rects: Record<FaceId, [number, number, number, number]>): Panel[] {
  return FACES.map((face) => {
    const [x, y, w, h] = rects[face];
    return { id: `${part}.${face}`, label: `${partLabel} ${FACE_LABEL[face].toLowerCase()}`, part, face, x, y, w, h };
  });
}

export const TEMPLATES: Record<ClothingKind, TemplateSpec> = {
  shirt: {
    kind: 'shirt',
    label: 'Shirt',
    width: 585,
    height: 559,
    scale: 1,
    panels: [
      ...panelsFor('torso', 'Torso', TORSO_RECTS),
      ...panelsFor('rightArm', 'Right sleeve', RIGHT_LIMB_RECTS),
      ...panelsFor('leftArm', 'Left sleeve', LEFT_LIMB_RECTS),
    ],
    groups: [
      { id: 'torso', label: 'Torso (all sides)' },
      { id: 'rightArm', label: 'Right sleeve (all sides)' },
      { id: 'leftArm', label: 'Left sleeve (all sides)' },
    ],
    note: 'Classic Shirt: wraps the torso and both arms. 585 × 559 PNG.',
  },
  pants: {
    kind: 'pants',
    label: 'Pants',
    width: 585,
    height: 559,
    scale: 1,
    panels: [
      ...panelsFor('torso', 'Waist', TORSO_RECTS),
      ...panelsFor('rightLeg', 'Right leg', RIGHT_LIMB_RECTS),
      ...panelsFor('leftLeg', 'Left leg', LEFT_LIMB_RECTS),
    ],
    groups: [
      { id: 'torso', label: 'Waist (all sides)' },
      { id: 'rightLeg', label: 'Right leg (all sides)' },
      { id: 'leftLeg', label: 'Left leg (all sides)' },
    ],
    note: 'Classic Pants: wraps the lower torso and both legs. 585 × 559 PNG.',
  },
  tshirt: {
    kind: 'tshirt',
    label: 'T-Shirt',
    width: 128,
    height: 128,
    scale: 4,
    panels: [{ id: 'chest.front', label: 'Chest', part: 'chest', face: 'front', x: 0, y: 0, w: 128, h: 128 }],
    groups: [],
    note: 'Classic T-Shirt: one square graphic on the front of the torso (drawn at 4× and exported at 128 × 128 or larger).',
  },
};

export const KIND_ORDER: ClothingKind[] = ['shirt', 'pants', 'tshirt'];

export function panelById(kind: ClothingKind, id: string): Panel | undefined {
  return TEMPLATES[kind].panels.find((p) => p.id === id);
}

export function panelFor(kind: ClothingKind, part: PartId, face: FaceId): Panel | undefined {
  return TEMPLATES[kind].panels.find((p) => p.part === part && p.face === face);
}

/** Rectangles a clip id covers (template pixels). */
export function clipRects(kind: ClothingKind, clip: string): Panel[] {
  const t = TEMPLATES[kind];
  if (clip === 'all') return t.panels;
  const single = t.panels.find((p) => p.id === clip);
  if (single) return [single];
  return t.panels.filter((p) => p.part === clip);
}

export function clipOptions(kind: ClothingKind): ClipOption[] {
  const t = TEMPLATES[kind];
  const opts: ClipOption[] = [{ id: 'all', label: kind === 'tshirt' ? 'Whole design' : 'Whole template' }];
  if (kind === 'tshirt') return opts;
  for (const g of t.groups) {
    opts.push({ id: g.id, label: g.label });
    for (const p of t.panels.filter((x) => x.part === g.id)) opts.push({ id: p.id, label: `   ${p.label}` });
  }
  return opts;
}

export function clipLabel(kind: ClothingKind, clip: string): string {
  return clipOptions(kind).find((o) => o.id === clip)?.label.trim() ?? clip;
}

/** Bounding box of a clip's rectangles. */
export function clipBounds(kind: ClothingKind, clip: string): { x: number; y: number; w: number; h: number } {
  const rects = clipRects(kind, clip);
  if (!rects.length) return { x: 0, y: 0, w: TEMPLATES[kind].width, h: TEMPLATES[kind].height };
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Which panel contains a template point, if any. */
export function panelAt(kind: ClothingKind, x: number, y: number): Panel | undefined {
  return TEMPLATES[kind].panels.find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
}

const SIDE_SWAP: Record<string, string> = {
  'torso.right': 'torso.left',
  'torso.left': 'torso.right',
  'rightArm.right': 'leftArm.left',
  'rightArm.left': 'leftArm.right',
  'leftArm.left': 'rightArm.right',
  'leftArm.right': 'rightArm.left',
  'rightLeg.right': 'leftLeg.left',
  'rightLeg.left': 'leftLeg.right',
  'leftLeg.left': 'rightLeg.right',
  'leftLeg.right': 'rightLeg.left',
};

/** The panel a horizontally mirrored design should land on (left <-> right). */
export function mirrorPanelId(id: string): string {
  if (SIDE_SWAP[id]) return SIDE_SWAP[id];
  const [part, face] = id.split('.');
  const swapPart: Record<string, string> = { rightArm: 'leftArm', leftArm: 'rightArm', rightLeg: 'leftLeg', leftLeg: 'rightLeg' };
  return `${swapPart[part] ?? part}.${face}`;
}

export function mirrorGroupId(id: string): string {
  const m: Record<string, string> = { rightArm: 'leftArm', leftArm: 'rightArm', rightLeg: 'leftLeg', leftLeg: 'rightLeg' };
  return m[id] ?? id;
}
