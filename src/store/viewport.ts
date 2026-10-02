import { create } from 'zustand';
import type { Vec3 } from '../types';

export interface CameraRequest {
  nonce: number;
  position: Vec3;
  target: Vec3;
}

interface ViewportState {
  wireframe: boolean;
  lighting: boolean;
  showAvatar: boolean;
  previewMode: boolean;
  cameraRequest: CameraRequest | null;
  setWireframe: (v: boolean) => void;
  setLighting: (v: boolean) => void;
  setShowAvatar: (v: boolean) => void;
  setPreviewMode: (v: boolean) => void;
  requestCamera: (position: Vec3, target: Vec3) => void;
}

let nonce = 1;

export const useViewport = create<ViewportState>((set) => ({
  wireframe: false,
  lighting: true,
  showAvatar: true,
  previewMode: false,
  cameraRequest: null,
  setWireframe: (wireframe) => set({ wireframe }),
  setLighting: (lighting) => set({ lighting }),
  setShowAvatar: (showAvatar) => set({ showAvatar }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  requestCamera: (position, target) => set({ cameraRequest: { nonce: nonce++, position, target } }),
}));

export const CAMERA_TARGET: Vec3 = [0, 2.9, 0];

export const CAMERA_VIEWS = {
  front: { label: 'Front', position: [0, 3.6, -13] as Vec3 },
  back: { label: 'Back', position: [0, 3.6, 13] as Vec3 },
  left: { label: 'Left', position: [-13, 3.6, 0] as Vec3 },
  right: { label: 'Right', position: [13, 3.6, 0] as Vec3 },
  threeQuarter: { label: '3/4', position: [-8.2, 4.6, -10.2] as Vec3 },
} as const;

export type CameraViewId = keyof typeof CAMERA_VIEWS;

export const DEFAULT_CAMERA = { position: CAMERA_VIEWS.threeQuarter.position, target: CAMERA_TARGET };
