export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export type PrimitiveKind = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus';
export type MeshKind = 'capsule' | 'wedge' | 'pyramid' | 'icosphere' | 'torusknot' | 'arch';
export type ShapeKind = PrimitiveKind | MeshKind | 'imported' | 'group';

export type SlotId = 'hat' | 'hair' | 'face' | 'shoulder' | 'back' | 'waist' | 'accessory';
export type RigType = 'R6' | 'R15';
export type ToolMode = 'select' | 'move' | 'rotate' | 'scale' | 'paint';
export type AnimationId = 'rest' | 'idle' | 'walk' | 'run' | 'jump';

export interface MaterialProps {
  color: string;
  metalness: number;
  roughness: number;
  /** 1 = opaque, 0 = fully transparent */
  opacity: number;
  emissive: string;
  emissiveIntensity: number;
  textureId: string | null;
  texRepeat: Vec2;
  texOffset: Vec2;
  /** degrees */
  texRotation: number;
  /** display only: last preset applied */
  preset?: string;
}

export interface SceneObject {
  id: string;
  name: string;
  kind: ShapeKind;
  parentId: string | null;
  position: Vec3;
  /** degrees, XYZ order */
  rotation: Vec3;
  scale: Vec3;
  material: MaterialProps;
  visible: boolean;
  locked: boolean;
  layerId: string;
  /** For kind === 'imported' */
  modelId?: string;
  /** Root accessory groups: where on the avatar this attaches */
  slot?: SlotId;
  /** Mesh resolution of primitives. 'low' uses far fewer triangles. */
  detail?: 'low' | 'normal';
  /** Hand-painted texture. Strokes are in pixels of a res x res image. Replaces colour/texture mapping on this part. */
  paint?: PaintData;
}

export interface PaintData {
  res: 128 | 256 | 512;
  strokes: Stroke[];
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface TextureAsset {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  source: 'upload' | 'builtin';
  createdAt: number;
}

/** Imported mesh, stored as base64 typed arrays so it survives save/load. */
export interface ModelAsset {
  id: string;
  name: string;
  positions: string;
  normals: string | null;
  uvs: string | null;
  index: string | null;
  triangles: number;
}

export interface CameraState {
  position: Vec3;
  target: Vec3;
}

export interface ProjectData {
  version: 1;
  /** Present on clothing projects. Accessory projects leave it undefined. */
  clothing?: ClothingData;
  objects: Record<string, SceneObject>;
  order: string[];
  layers: Layer[];
  textures: TextureAsset[];
  models: Record<string, ModelAsset>;
  rig: RigType;
  camera: CameraState;
}

export interface ProjectMeta {
  id: string;
  kind?: 'accessory' | 'clothing';
  name: string;
  createdAt: number;
  updatedAt: number;
  objectCount: number;
  thumbnail: string | null;
}

export interface Snapshot {
  objects: Record<string, SceneObject>;
  order: string[];
  layers: Layer[];
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

/** Declarative description of a part (used by presets and the asset library). */
export interface PartSpec {
  name: string;
  kind: ShapeKind;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  material?: Partial<MaterialProps>;
  layer?: 'main' | 'details' | 'glow';
  slot?: SlotId;
  children?: PartSpec[];
}

export type AssetCategory =
  | 'hats'
  | 'hair'
  | 'face'
  | 'back'
  | 'shoulder'
  | 'waist'
  | 'accessories'
  | 'materials'
  | 'textures';

export interface UserAsset {
  id: string;
  name: string;
  category: AssetCategory;
  slot: SlotId;
  spec: PartSpec;
  createdAt: number;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error';
export interface LogEntry {
  id: number;
  time: number;
  level: LogLevel;
  message: string;
}

// ---------------------------------------------------------------- clothing

export type ClothingKind = 'shirt' | 'pants' | 'tshirt';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';
export type PatternId = 'stripes' | 'checker' | 'dots' | 'grid' | 'camo' | 'zigzag';
export type ShapeType = 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'star' | 'hexagon';

/**
 * A non-destructive mask: strokes paint where the layer is HIDDEN (the brush hides, the eraser reveals again).
 * `invert` flips it so only the painted area shows. The layer's own pixels are never changed.
 */
export interface LayerMask {
  strokes: Stroke[];
  invert: boolean;
  enabled: boolean;
}

export interface ClothingLayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  /** 'all', a body-part group id (torso, rightArm...) or a single panel id (torso.front) */
  clip: string;
  mask?: LayerMask;
  /** The group (folder) this layer belongs to. Groups do not nest. */
  groupId?: string;
}

export interface FillLayer extends ClothingLayerBase {
  type: 'fill';
  color: string;
  /** Second colour makes a linear gradient */
  color2: string | null;
  angle: number;
}

export interface PatternLayer extends ClothingLayerBase {
  type: 'pattern';
  pattern: PatternId;
  color: string;
  color2: string;
  size: number;
  angle: number;
}

export interface ImageLayer extends ClothingLayerBase {
  type: 'image';
  imageId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  flipX: boolean;
}

export interface TextLayer extends ClothingLayerBase {
  type: 'text';
  text: string;
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  stroke: string;
  strokeWidth: number;
  align: 'left' | 'center' | 'right';
  x: number;
  y: number;
  rotation: number;
  /** Extra space between letters, in template px (default 0) */
  spacing?: number;
  /** Bend the text along an arc: total sweep in degrees. Positive curves up like a rainbow, negative like a smile (default 0) */
  curve?: number;
}

export interface ShapeLayer extends ClothingLayerBase {
  type: 'shape';
  shape: ShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export interface Stroke {
  color: string;
  size: number;
  erase: boolean;
  points: [number, number][];
  /** 0 = very soft edge, 1 = hard edge (default 1) */
  hardness?: number;
  /** stroke opacity 0..1 (default 1), applied to the whole stroke so overlaps do not build up */
  alpha?: number;
  /** Non-solid brush fills. Pattern repeats across the template; gradient fades top to bottom over the stroke. */
  fill?: { type: 'pattern'; pattern: PatternId; color2: string; size: number } | { type: 'gradient'; color2: string };
}

export interface PaintLayer extends ClothingLayerBase {
  type: 'paint';
  strokes: Stroke[];
}

/**
 * A folder of layers. It draws nothing itself: hiding or locking it affects its members, and its opacity is
 * multiplied into each member's. Its members follow it directly in the layer list (see clothing/groups.ts).
 */
export interface GroupLayer extends ClothingLayerBase {
  type: 'group';
  collapsed: boolean;
}

export type ClothingLayer = FillLayer | PatternLayer | ImageLayer | TextLayer | ShapeLayer | PaintLayer | GroupLayer;

export interface ClothingImage {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface ClothingData {
  version: 1;
  designs: Record<ClothingKind, ClothingLayer[]>;
  images: ClothingImage[];
  activeKind: ClothingKind;
  /** R15 segment split tuned after testing on a real avatar */
  r15?: { torsoLower: number; limbUpper: number; limbLower: number };
}
