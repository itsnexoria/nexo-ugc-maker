import type { RigType, SlotId, Vec3 } from '../types';

/**
 * Stylised Roblox-proportioned mannequin. Units are studs, Y up, and the avatar
 * faces -Z (the Roblox convention). The avatar's right side is +X.
 * All positions are absolute rest-pose values; the viewport derives local offsets.
 */
export type BoneTone = 'head' | 'body' | 'limb' | 'extremity';

export interface BoneDef {
  name: string;
  parent: string | null;
  size: Vec3;
  /** Joint (pivot) position in the rest pose */
  joint: Vec3;
  /** Visual centre of the part in the rest pose */
  center: Vec3;
  tone: BoneTone;
}

const mirror = (name: string, base: Omit<BoneDef, 'name'>, side: 'Left' | 'Right', sx: number): BoneDef => ({
  ...base,
  name: `${side}${name}`,
  joint: [base.joint[0] * sx, base.joint[1], base.joint[2]],
  center: [base.center[0] * sx, base.center[1], base.center[2]],
});

export const R6_BONES: BoneDef[] = [
  { name: 'Torso', parent: null, size: [2, 2, 1], joint: [0, 3, 0], center: [0, 3, 0], tone: 'body' },
  { name: 'Head', parent: 'Torso', size: [1.2, 1.2, 1.2], joint: [0, 4, 0], center: [0, 4.6, 0], tone: 'head' },
  { name: 'Right Arm', parent: 'Torso', size: [1, 2, 1], joint: [1.5, 4, 0], center: [1.5, 3, 0], tone: 'limb' },
  { name: 'Left Arm', parent: 'Torso', size: [1, 2, 1], joint: [-1.5, 4, 0], center: [-1.5, 3, 0], tone: 'limb' },
  { name: 'Right Leg', parent: 'Torso', size: [1, 2, 1], joint: [0.5, 2, 0], center: [0.5, 1, 0], tone: 'limb' },
  { name: 'Left Leg', parent: 'Torso', size: [1, 2, 1], joint: [-0.5, 2, 0], center: [-0.5, 1, 0], tone: 'limb' },
];

const upperArm = { parent: 'UpperTorso', size: [1, 1.1, 1] as Vec3, joint: [1.5, 3.95, 0] as Vec3, center: [1.5, 3.4, 0] as Vec3, tone: 'limb' as BoneTone };
const lowerArm = { parent: '', size: [1, 1, 1] as Vec3, joint: [1.5, 2.85, 0] as Vec3, center: [1.5, 2.35, 0] as Vec3, tone: 'limb' as BoneTone };
const hand = { parent: '', size: [1, 0.3, 1] as Vec3, joint: [1.5, 1.85, 0] as Vec3, center: [1.5, 1.7, 0] as Vec3, tone: 'extremity' as BoneTone };
const upperLeg = { parent: 'LowerTorso', size: [1, 1, 1] as Vec3, joint: [0.5, 2.2, 0] as Vec3, center: [0.5, 1.7, 0] as Vec3, tone: 'limb' as BoneTone };
const lowerLeg = { parent: '', size: [1, 0.9, 1] as Vec3, joint: [0.5, 1.2, 0] as Vec3, center: [0.5, 0.75, 0] as Vec3, tone: 'limb' as BoneTone };
const foot = { parent: '', size: [1, 0.3, 1] as Vec3, joint: [0.5, 0.3, 0] as Vec3, center: [0.5, 0.15, 0] as Vec3, tone: 'extremity' as BoneTone };

function side(sideName: 'Left' | 'Right', sx: number): BoneDef[] {
  return [
    mirror('UpperArm', upperArm, sideName, sx),
    mirror('LowerArm', { ...lowerArm, parent: `${sideName}UpperArm` }, sideName, sx),
    mirror('Hand', { ...hand, parent: `${sideName}LowerArm` }, sideName, sx),
    mirror('UpperLeg', upperLeg, sideName, sx),
    mirror('LowerLeg', { ...lowerLeg, parent: `${sideName}UpperLeg` }, sideName, sx),
    mirror('Foot', { ...foot, parent: `${sideName}LowerLeg` }, sideName, sx),
  ];
}

export const R15_BONES: BoneDef[] = [
  { name: 'LowerTorso', parent: null, size: [2, 0.4, 1], joint: [0, 2.2, 0], center: [0, 2.4, 0], tone: 'body' },
  { name: 'UpperTorso', parent: 'LowerTorso', size: [2, 1.6, 1], joint: [0, 2.6, 0], center: [0, 3.4, 0], tone: 'body' },
  { name: 'Head', parent: 'UpperTorso', size: [1.2, 1.2, 1.2], joint: [0, 4.2, 0], center: [0, 4.8, 0], tone: 'head' },
  ...side('Right', 1),
  ...side('Left', -1),
];

export const BONES: Record<RigType, BoneDef[]> = { R6: R6_BONES, R15: R15_BONES };

/** Where each accessory slot attaches on the rest-pose avatar (similar to Roblox attachment points). */
export const SLOT_ANCHORS: Record<RigType, Record<SlotId, Vec3>> = {
  R6: {
    hat: [0, 5.2, 0],
    hair: [0, 5.1, 0],
    face: [0, 4.6, -0.62],
    shoulder: [1.25, 4, 0],
    back: [0, 3.4, 0.5],
    waist: [0, 2.1, 0],
    accessory: [0, 3, 0],
  },
  R15: {
    hat: [0, 5.4, 0],
    hair: [0, 5.3, 0],
    face: [0, 4.8, -0.62],
    shoulder: [1.25, 4.2, 0],
    back: [0, 3.5, 0.5],
    waist: [0, 2.4, 0],
    accessory: [0, 3.4, 0],
  },
};

/** The bone an accessory follows while the avatar animates. */
export const SLOT_BONE: Record<RigType, Record<SlotId, string>> = {
  R6: { hat: 'Head', hair: 'Head', face: 'Head', shoulder: 'Torso', back: 'Torso', waist: 'Torso', accessory: 'Torso' },
  R15: {
    hat: 'Head',
    hair: 'Head',
    face: 'Head',
    shoulder: 'UpperTorso',
    back: 'UpperTorso',
    waist: 'LowerTorso',
    accessory: 'UpperTorso',
  },
};

export const SLOT_LABELS: Record<SlotId, string> = {
  hat: 'Hat',
  hair: 'Hair',
  face: 'Face',
  shoulder: 'Shoulder',
  back: 'Back',
  waist: 'Waist',
  accessory: 'Accessory',
};

export const AVATAR_TONES: Record<BoneTone, string> = {
  head: '#d9dbe1',
  body: '#a7abb5',
  limb: '#8d919c',
  extremity: '#d9dbe1',
};
