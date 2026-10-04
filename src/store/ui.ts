import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { AssetCategory, LogEntry, LogLevel } from '../types';

export type BottomTab = 'scene' | 'objects' | 'materials' | 'textures' | 'layers' | 'assets' | 'console';
export type RightTab = 'properties' | 'validation';
export type ModalId = 'settings' | 'export' | 'exportClothing' | 'new' | 'open' | 'shortcuts' | 'about' | null;

export interface MenuItem {
  label?: string;
  icon?: ReactNode;
  shortcut?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export interface Toast {
  id: number;
  kind: LogLevel;
  message: string;
  action?: { label: string; onClick: () => void };
}

export interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface PromptState {
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
}

interface UIState {
  bottomTab: BottomTab;
  bottomOpen: boolean;
  bottomHeight: number;
  rightTab: RightTab;
  modal: ModalId;
  /** Category currently open in the toolbox asset popover */
  picker: AssetCategory | 'mesh' | 'part' | null;
  contextMenu: { x: number; y: number; items: MenuItem[] } | null;
  confirm: ConfirmState | null;
  prompt: PromptState | null;
  toasts: Toast[];
  logs: LogEntry[];
  busy: string | null;
  tour: 'accessory' | 'clothing' | null;

  startTour: (mode: 'accessory' | 'clothing') => void;
  endTour: () => void;
  setBottomTab: (t: BottomTab) => void;
  toggleBottom: () => void;
  setBottomHeight: (h: number) => void;
  setRightTab: (t: RightTab) => void;
  openModal: (m: ModalId) => void;
  closeModal: () => void;
  setPicker: (p: UIState['picker']) => void;
  openContextMenu: (x: number, y: number, items: MenuItem[]) => void;
  closeContextMenu: () => void;
  askConfirm: (c: ConfirmState) => void;
  closeConfirm: () => void;
  askText: (p: PromptState) => void;
  closePrompt: () => void;
  toast: (kind: LogLevel, message: string, action?: Toast['action']) => void;
  dismissToast: (id: number) => void;
  log: (level: LogLevel, message: string) => void;
  clearLogs: () => void;
  setBusy: (msg: string | null) => void;
}

let toastId = 1;
let logId = 1;

export const useUI = create<UIState>((set, get) => ({
  bottomTab: 'scene',
  bottomOpen: true,
  bottomHeight: 214,
  rightTab: 'properties',
  modal: null,
  picker: null,
  contextMenu: null,
  confirm: null,
  prompt: null,
  toasts: [],
  logs: [{ id: 0, time: Date.now(), level: 'info', message: 'Nexo UGC Studio ready.' }],
  busy: null,
  tour: null,

  startTour: (tour) => set({ tour, contextMenu: null, modal: null }),
  endTour: () => set({ tour: null }),
  setBottomTab: (t) => set({ bottomTab: t, bottomOpen: true }),
  toggleBottom: () => set((s) => ({ bottomOpen: !s.bottomOpen })),
  setBottomHeight: (h) => set({ bottomHeight: Math.min(460, Math.max(140, h)) }),
  setRightTab: (t) => set({ rightTab: t }),
  openModal: (m) => set({ modal: m, contextMenu: null, picker: null }),
  closeModal: () => set({ modal: null }),
  setPicker: (p) => set({ picker: p, contextMenu: null }),
  openContextMenu: (x, y, items) => set({ contextMenu: { x, y, items }, picker: null }),
  closeContextMenu: () => set({ contextMenu: null }),
  askConfirm: (c) => set({ confirm: c }),
  closeConfirm: () => set({ confirm: null }),
  askText: (prompt) => set({ prompt }),
  closePrompt: () => set({ prompt: null }),
  toast: (kind, message, action) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message, action }] }));
    setTimeout(() => get().dismissToast(id), action ? 6000 : 3200);
    get().log(kind, message);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  log: (level, message) =>
    set((s) => ({ logs: [...s.logs.slice(-299), { id: logId++, time: Date.now(), level, message }] })),
  clearLogs: () => set({ logs: [] }),
  setBusy: (msg) => set({ busy: msg }),
}));
