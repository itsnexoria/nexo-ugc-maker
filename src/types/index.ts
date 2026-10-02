export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export type PrimitiveKind = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus';
export type MeshKind = 'capsule' | 'wedge' | 'pyramid' | 'icosphere' | 'torusknot' | 'arch';
export type ShapeKind = PrimitiveKind | MeshKind | 'imported' | 'group';

export type SlotId = 'hat' | 'hair' | 'face' | 'shoulder' | 'back' | 'waist' | 'accessory';
export type RigType = 'R6' | 'R15';
export type ToolMode = 'select' | 'move' | 'rotate' | 'scale';
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
