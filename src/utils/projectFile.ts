import { DEFAULT_MATERIAL } from '../assets/materials';
import { DEFAULT_LAYERS } from './scene';
import { normalizeGroups } from '../clothing/groups';
import { DEFAULT_CAMERA } from '../store/viewport';
import type { ClothingData, ClothingKind, ClothingLayer, Layer, MaterialProps, ModelAsset, ProjectData, SceneObject, TextureAsset, Vec3 } from '../types';

/**
 * Project file format.
 *  1  original format
 *  2  adds `savedWith` and is validated and repaired on import
 * Files from a NEWER version are refused with a clear message instead of being half-read.
 */
export const FILE_FORMAT_VERSION = 2;
export const APP_ID = 'nexo-ugc-studio';
const MAX_FILE_CHARS = 250_000_000;
const MAX_OBJECTS = 5000;

export interface ProjectFileShape {
  app: typeof APP_ID;
  version: number;
  name: string;
  savedWith?: string;
  data: ProjectData;
}

export interface ParsedProject {
  name: string;
  data: ProjectData;
  /** things that had to be repaired or dropped, in plain words */
  warnings: string[];
  fromVersion: number;
}

const SHAPES = new Set(['cube', 'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'wedge', 'pyramid', 'icosphere', 'torusknot', 'arch', 'imported', 'group']);
const SLOTS = new Set(['hat', 'hair', 'face', 'shoulder', 'back', 'waist', 'accessory']);
const KINDS: ClothingKind[] = ['shirt', 'pants', 'tshirt'];
const CLOTHING_LAYER_TYPES = new Set(['fill', 'pattern', 'image', 'text', 'shape', 'paint', 'group']);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isImageUrl = (v: unknown): v is string => isStr(v) && v.startsWith('data:image/');

function vec3(v: unknown, fallback: Vec3): Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every(isNum) ? ([v[0], v[1], v[2]] as Vec3) : fallback;
}

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return isNum(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** Serialises a project for download. */
export function stringifyProjectFile(name: string, data: ProjectData, appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'): string {
  const file: ProjectFileShape = { app: APP_ID, version: FILE_FORMAT_VERSION, name, savedWith: appVersion, data };
  return JSON.stringify(file);
}

/** Upgrades older file versions one step at a time. Version 1 to 2 only adds fields, so nothing needs reshaping. */
function migrate(file: ProjectFileShape): ProjectFileShape {
  let f = file;
  if (f.version < 2) f = { ...f, version: 2 };
  return f;
}

function sanitizeMaterial(raw: unknown, textureIds: Set<string>, warn: (m: string) => void, objName: string): MaterialProps {
  const m = isObj(raw) ? raw : {};
  const d = DEFAULT_MATERIAL;
  const textureId = isStr(m.textureId) && textureIds.has(m.textureId) ? m.textureId : null;
  if (isStr(m.textureId) && !textureId) warn(`“${objName}” used a texture that is not in the file; it was cleared.`);
  const vec2 = (v: unknown, f: [number, number]): [number, number] => (Array.isArray(v) && v.length === 2 && v.every(isNum) ? [v[0], v[1]] : f);
  return {
    ...d,
    color: isStr(m.color) ? m.color : d.color,
    metalness: num(m.metalness, d.metalness, 0, 1),
    roughness: num(m.roughness, d.roughness, 0, 1),
    opacity: num(m.opacity, d.opacity, 0, 1),
    emissive: isStr(m.emissive) ? m.emissive : d.emissive,
    emissiveIntensity: num(m.emissiveIntensity, d.emissiveIntensity, 0, 20),
    textureId,
    texRepeat: vec2(m.texRepeat, d.texRepeat as [number, number]),
    texOffset: vec2(m.texOffset, d.texOffset as [number, number]),
    texRotation: num(m.texRotation, d.texRotation),
    ...(isStr(m.preset) ? { preset: m.preset } : {}),
  };
}

function sanitizeClothing(raw: unknown, warn: (m: string) => void): ClothingData {
  const c = isObj(raw) ? raw : {};
  const images = (Array.isArray(c.images) ? c.images : []).filter((i): i is Record<string, unknown> => {
    const ok = isObj(i) && isStr(i.id) && isImageUrl(i.dataUrl);
    if (!ok) warn('An image in the clothing library was damaged and was dropped.');
    return ok;
  }) as unknown as ClothingData['images'];
  const imageIds = new Set(images.map((i) => i.id));
  const designs = { shirt: [], pants: [], tshirt: [] } as Record<ClothingKind, ClothingLayer[]>;
  const rawDesigns = isObj(c.designs) ? c.designs : {};
  for (const k of KINDS) {
    const list = Array.isArray(rawDesigns[k]) ? (rawDesigns[k] as unknown[]) : [];
    designs[k] = list.filter((l): l is ClothingLayer => {
      if (!isObj(l) || !isStr(l.id) || !CLOTHING_LAYER_TYPES.has(String(l.type))) {
        warn(`A damaged layer on the ${k} was dropped.`);
        return false;
      }
      if (l.type === 'image' && !(isStr(l.imageId) && imageIds.has(l.imageId))) {
        warn(`An image layer on the ${k} pointed at a missing picture and was dropped.`);
        return false;
      }
      return true;
    }).map((l) => {
      // a damaged mask is dropped rather than failing the whole file
      const mask = (l as { mask?: unknown }).mask;
      if (mask !== undefined && !(isObj(mask) && Array.isArray(mask.strokes))) {
        warn(`A mask on the ${k} was damaged and was removed.`);
        const { mask: _m, ...rest } = l as ClothingLayer & { mask?: unknown };
        return rest as ClothingLayer;
      }
      return l;
    });
    designs[k] = normalizeGroups(designs[k]);
  }
  const r15 = isObj(c.r15) && isNum(c.r15.torsoLower) && isNum(c.r15.limbUpper) && isNum(c.r15.limbLower) ? { torsoLower: c.r15.torsoLower, limbUpper: c.r15.limbUpper, limbLower: c.r15.limbLower } : undefined;
  return { version: 1, designs, images, activeKind: KINDS.includes(c.activeKind as ClothingKind) ? (c.activeKind as ClothingKind) : 'shirt', ...(r15 ? { r15 } : {}) };
}

/** Checks a project and repairs what can be repaired, so one damaged entry cannot make the whole file unusable. */
export function sanitizeProject(raw: unknown, warnings: string[]): ProjectData {
  const warn = (m: string) => {
    if (!warnings.includes(m)) warnings.push(m);
  };
  if (!isObj(raw)) throw new Error('The project file has no scene data.');
  if (!isObj(raw.objects) || !Array.isArray(raw.order)) throw new Error('The project file is missing its scene data (objects).');

  // layers
  const layers: Layer[] = (Array.isArray(raw.layers) ? raw.layers : [])
    .filter((l): l is Record<string, unknown> => isObj(l) && isStr(l.id))
    .map((l) => ({ id: l.id as string, name: isStr(l.name) ? l.name : 'Layer', visible: l.visible !== false, locked: l.locked === true }));
  if (!layers.length) {
    layers.push(...DEFAULT_LAYERS.map((l) => ({ ...l })));
    warn('The file had no layers, so the default ones were added.');
  }
  const layerIds = new Set(layers.map((l) => l.id));

  // textures
  const textures: TextureAsset[] = (Array.isArray(raw.textures) ? raw.textures : [])
    .filter((t): t is Record<string, unknown> => {
      const ok = isObj(t) && isStr(t.id) && isImageUrl(t.dataUrl);
      if (!ok) warn('A texture in the file was damaged and was dropped.');
      return ok;
    })
    .map((t) => ({
      id: t.id as string,
      name: isStr(t.name) ? t.name : 'Texture',
      dataUrl: t.dataUrl as string,
      width: num(t.width, 0, 0, 16384),
      height: num(t.height, 0, 0, 16384),
      source: t.source === 'builtin' ? 'builtin' : 'upload',
      createdAt: num(t.createdAt, 0),
    })) as TextureAsset[];
  const textureIds = new Set(textures.map((t) => t.id));

  // imported meshes
  const models: Record<string, ModelAsset> = {};
  for (const [id, m] of Object.entries(isObj(raw.models) ? raw.models : {})) {
    if (isObj(m) && isStr(m.positions) && m.positions.length > 0) {
      models[id] = {
        id,
        name: isStr(m.name) ? m.name : 'Mesh',
        positions: m.positions,
        normals: isStr(m.normals) ? m.normals : null,
        uvs: isStr(m.uvs) ? m.uvs : null,
        index: isStr(m.index) ? m.index : null,
        triangles: num(m.triangles, 0, 0),
      };
    } else warn('An imported mesh in the file was damaged and was dropped.');
  }

  // objects
  const entries = Object.entries(raw.objects);
  if (entries.length > MAX_OBJECTS) throw new Error(`This project has ${entries.length.toLocaleString()} parts, more than the ${MAX_OBJECTS.toLocaleString()} the editor supports.`);
  const objects: Record<string, SceneObject> = {};
  for (const [key, o] of entries) {
    if (!isObj(o) || !SHAPES.has(String(o.kind))) {
      warn('A part with an unknown shape was dropped.');
      continue;
    }
    const name = isStr(o.name) && o.name ? o.name : 'Part';
    if (o.kind === 'imported' && !(isStr(o.modelId) && models[o.modelId])) {
      warn(`“${name}” is an imported mesh whose data is missing, so it was dropped.`);
      continue;
    }
    objects[key] = {
      id: key,
      name,
      kind: o.kind as SceneObject['kind'],
      parentId: isStr(o.parentId) ? o.parentId : null,
      position: vec3(o.position, [0, 0, 0]),
      rotation: vec3(o.rotation, [0, 0, 0]),
      scale: vec3(o.scale, [1, 1, 1]),
      material: sanitizeMaterial(o.material, textureIds, warn, name),
      visible: o.visible !== false,
      locked: o.locked === true,
      layerId: isStr(o.layerId) && layerIds.has(o.layerId) ? o.layerId : layers[0].id,
      ...(isStr(o.modelId) && models[o.modelId] ? { modelId: o.modelId } : {}),
      ...(isStr(o.slot) && SLOTS.has(o.slot) ? { slot: o.slot as SceneObject['slot'] } : {}),
      ...(o.detail === 'low' || o.detail === 'normal' ? { detail: o.detail } : {}),
      ...(isObj(o.paint) && Array.isArray(o.paint.strokes) && [128, 256, 512].includes(o.paint.res as number) ? { paint: o.paint as unknown as SceneObject['paint'] } : {}),
    };
  }
  // parents must exist (and not point at themselves)
  for (const o of Object.values(objects)) {
    if (o.parentId && (o.parentId === o.id || !objects[o.parentId])) {
      warn(`“${o.name}” lost its parent group and was moved to the top level.`);
      o.parentId = null;
    }
  }
  // a parent loop would hang the editor, so break any
  for (const o of Object.values(objects)) {
    const seen = new Set<string>([o.id]);
    let p = o.parentId ? objects[o.parentId] : undefined;
    while (p) {
      if (seen.has(p.id)) {
        warn(`“${o.name}” was part of a group loop and was moved to the top level.`);
        o.parentId = null;
        break;
      }
      seen.add(p.id);
      p = p.parentId ? objects[p.parentId] : undefined;
    }
  }

  // order: only real, unique ids, with any part missing from it added at the end
  const order: string[] = [];
  const seen = new Set<string>();
  for (const id of raw.order) if (isStr(id) && objects[id] && !seen.has(id)) (seen.add(id), order.push(id));
  for (const id of Object.keys(objects)) if (!seen.has(id)) order.push(id);

  const cam = isObj(raw.camera) ? raw.camera : {};
  const data: ProjectData = {
    version: 1,
    objects,
    order,
    layers,
    textures,
    models,
    rig: raw.rig === 'R15' ? 'R15' : 'R6',
    camera: { position: vec3(cam.position, DEFAULT_CAMERA.position), target: vec3(cam.target, DEFAULT_CAMERA.target) },
  };
  if (raw.clothing !== undefined) data.clothing = sanitizeClothing(raw.clothing, warn);
  return data;
}

export function parseProjectFileText(text: string): ParsedProject {
  if (text.length > MAX_FILE_CHARS) throw new Error('This file is too large to be a project file.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON, so it is not a project file or it was cut off while downloading.');
  }
  if (!isObj(parsed) || parsed.app !== APP_ID || !isObj(parsed.data)) throw new Error('This is not a Nexo UGC Studio project file.');
  const version = isNum(parsed.version) ? parsed.version : 1;
  if (version > FILE_FORMAT_VERSION) {
    const by = isStr(parsed.savedWith) ? ` (saved with version ${parsed.savedWith})` : '';
    throw new Error(`This project was made with a newer version of Nexo UGC Studio${by}. Update the app and try again.`);
  }
  const file = migrate({ app: APP_ID, version, name: isStr(parsed.name) ? parsed.name : 'Imported project', savedWith: isStr(parsed.savedWith) ? parsed.savedWith : undefined, data: parsed.data as unknown as ProjectData });
  const warnings: string[] = [];
  const data = sanitizeProject(file.data, warnings);
  return { name: String(file.name).trim().slice(0, 60) || 'Imported project', data, warnings, fromVersion: version };
}
