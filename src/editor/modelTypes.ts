/** File-type helpers for model imports. Kept free of three.js so the UI can use them without loading the loaders. */
export const MODEL_EXTENSIONS = ['obj', 'glb', 'gltf'];
export const SIDECAR_EXTENSIONS = ['mtl', 'bin'];
export const extOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? '';
