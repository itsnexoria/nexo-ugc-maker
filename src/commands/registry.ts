import { duplicateSelection, focusSelection, requestDelete, startRename } from '../editor/actions';
import { pickFiles, MODEL_ACCEPT, importModelFiles } from '../editor/importers';
import { effective } from '../clothing/groups';
import { useClothing } from '../store/clothing';
import { useEditor } from '../store/editor';
import { downloadCurrentBackup, goHome, saveNow } from '../store/session';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { CAMERA_TARGET, CAMERA_VIEWS, DEFAULT_CAMERA, useViewport, type CameraViewId } from '../store/viewport';
import { comboFromEvent, type KeyLike } from './keys';

export type CommandScreen = 'editor' | 'clothing';

export interface Command {
  id: string;
  title: string;
  group: string;
  screens: CommandScreen[];
  /** default key combos (see keys.ts); none means the command is only in the palette */
  keys?: string[];
  run: () => void;
  /** a command that is not applicable right now neither runs nor swallows its key */
  enabled?: () => boolean;
  /** runs even while typing in a field or with a dialog open (Save) */
  inInputs?: boolean;
}

const VIEW_IDS: CameraViewId[] = ['front', 'back', 'left', 'right', 'threeQuarter'];
const VIEW_TITLES = ['Front', 'Back', 'Left', 'Right', 'Three-quarter'];
const both: CommandScreen[] = ['editor', 'clothing'];
const ed: CommandScreen[] = ['editor'];
const cl: CommandScreen[] = ['clothing'];
const E = () => useEditor.getState();
const C = () => useClothing.getState();
const toggleSetting = (k: 'showGrid' | 'snap') => useSettings.getState().set(k, !useSettings.getState()[k]);

export function getCommands(): Command[] {
  const list: Command[] = [
    // ---- both screens
    { id: 'file.save', title: 'Save project', group: 'File', screens: both, keys: ['mod+s'], inInputs: true, run: () => void saveNow(true) },
    { id: 'edit.undo', title: 'Undo', group: 'Edit', screens: both, keys: ['mod+z'], run: () => (E().screen === 'clothing' ? C().undo() : E().undo()) },
    { id: 'edit.redo', title: 'Redo', group: 'Edit', screens: both, keys: ['mod+shift+z', 'mod+y'], run: () => (E().screen === 'clothing' ? C().redo() : E().redo()) },
    { id: 'edit.duplicate', title: 'Duplicate selection', group: 'Edit', screens: both, keys: ['mod+d'], run: () => (E().screen === 'clothing' ? C().selectedIds.length && C().duplicateLayers(C().selectedIds) : duplicateSelection()) },
    {
      id: 'edit.delete',
      title: 'Delete selection',
      group: 'Edit',
      screens: both,
      keys: ['delete', 'backspace'],
      enabled: () => (E().screen === 'clothing' ? C().selectedIds.length > 0 : !!E().selectedId),
      run: () => (E().screen === 'clothing' ? C().removeLayers(C().selectedIds) : requestDelete(E().selectedId!)),
    },
    {
      id: 'edit.deselect',
      title: 'Deselect / leave mode',
      group: 'Edit',
      screens: both,
      keys: ['escape'],
      run: () => {
        if (E().screen === 'clothing') {
          C().select(null);
          C().setTool('select');
          return;
        }
        const vp = useViewport.getState();
        if (vp.previewMode) vp.setPreviewMode(false);
        else if (E().tool === 'paint') E().setTool('select');
        else E().select(null);
      },
    },
    { id: 'help.shortcuts', title: 'Keyboard shortcuts', group: 'Help', screens: both, keys: ['?'], run: () => useUI.getState().openModal('shortcuts') },

    // ---- accessory editor
    { id: 'edit.rename', title: 'Rename selected object', group: 'Edit', screens: ed, keys: ['f2'], enabled: () => !!E().selectedId, run: () => startRename(E().selectedId!) },
    { id: 'view.focus', title: 'Focus selected object', group: 'View', screens: ed, keys: ['f'], run: () => focusSelection() },
    { id: 'view.reset', title: 'Reset camera', group: 'View', screens: ed, keys: ['home'], run: () => useViewport.getState().requestCamera(DEFAULT_CAMERA.position, DEFAULT_CAMERA.target) },
    ...VIEW_IDS.map<Command>((id, i) => ({ id: `view.${id}`, title: `Camera: ${VIEW_TITLES[i]}`, group: 'View', screens: ed, keys: [String(i + 1)], run: () => useViewport.getState().requestCamera(CAMERA_VIEWS[id].position, CAMERA_TARGET) })),
    { id: 'tool.select', title: 'Select tool', group: 'Tools', screens: ed, keys: ['v'], run: () => E().setTool('select') },
    { id: 'tool.move', title: 'Move tool', group: 'Tools', screens: ed, keys: ['w'], run: () => E().setTool('move') },
    { id: 'tool.rotate', title: 'Rotate tool', group: 'Tools', screens: ed, keys: ['e'], run: () => E().setTool('rotate') },
    { id: 'tool.scale', title: 'Scale tool', group: 'Tools', screens: ed, keys: ['r'], run: () => E().setTool('scale') },
    { id: 'tool.paint', title: 'Paint tool', group: 'Tools', screens: ed, keys: ['b'], run: () => E().setTool('paint') },
    { id: 'view.grid', title: 'Toggle grid', group: 'View', screens: ed, keys: ['g'], run: () => toggleSetting('showGrid') },
    { id: 'view.snap', title: 'Toggle snap to grid', group: 'View', screens: ed, keys: ['x'], run: () => toggleSetting('snap') },
    { id: 'view.lighting', title: 'Toggle lighting', group: 'View', screens: ed, keys: ['l'], run: () => useViewport.getState().setLighting(!useViewport.getState().lighting) },
    { id: 'view.wireframe', title: 'Toggle wireframe', group: 'View', screens: ed, keys: ['z'], run: () => useViewport.getState().setWireframe(!useViewport.getState().wireframe) },
    {
      id: 'view.preview',
      title: 'Preview mode',
      group: 'View',
      screens: ed,
      keys: ['p'],
      run: () => {
        const vp = useViewport.getState();
        vp.setPreviewMode(!vp.previewMode);
        if (!vp.previewMode && E().animation === 'rest') E().setAnimation('idle');
      },
    },
    { id: 'file.importModel', title: 'Import a 3D model…', group: 'File', screens: ed, run: () => void pickFiles(MODEL_ACCEPT, true).then((f) => {
          if (f.length) void importModelFiles(f);
        }) },
    { id: 'mod.mirror', title: 'Mirror copy of the selected part', group: 'Modifiers', screens: ed, enabled: () => !!E().selectedId, run: () => void import('../editor/modifiers').then((m) => m.mirrorObject(E().selectedId!)) },
    { id: 'mod.reduce', title: 'Reduce triangles of the selected part…', group: 'Modifiers', screens: ed, enabled: () => !!E().selectedId && E().objects[E().selectedId!]?.kind !== 'group', run: () => useUI.getState().openModal('reduce') },
    { id: 'mod.uv', title: 'UV layout of the selected part…', group: 'Modifiers', screens: ed, enabled: () => !!E().selectedId && E().objects[E().selectedId!]?.kind !== 'group', run: () => useUI.getState().openModal('uv') },
    { id: 'file.export', title: 'Export…', group: 'File', screens: ed, run: () => useUI.getState().openModal('export') },

    // ---- clothing editor
    { id: 'edit.selectAll', title: 'Select all layers', group: 'Edit', screens: cl, keys: ['mod+a'], run: () => C().selectMany(C().designs[C().activeKind].filter((l, _i, all) => l.type !== 'group' && !effective(all, l).locked).map((l) => l.id)) },
    { id: 'ctool.select', title: 'Select and move layers', group: 'Tools', screens: cl, keys: ['v'], run: () => C().setTool('select') },
    { id: 'ctool.place', title: 'Place on model', group: 'Tools', screens: cl, keys: ['p'], run: () => C().setTool('place') },
    { id: 'ctool.brush', title: 'Brush', group: 'Tools', screens: cl, keys: ['b'], run: () => C().setTool('brush') },
    { id: 'ctool.fill', title: 'Fill (magic wand)', group: 'Tools', screens: cl, keys: ['g'], run: () => C().setTool('fill') },
    { id: 'ctool.eraser', title: 'Eraser', group: 'Tools', screens: cl, keys: ['e'], run: () => C().setTool('eraser') },
    ...(
      [
        ['left', -1, 0],
        ['right', 1, 0],
        ['up', 0, -1],
        ['down', 0, 1],
      ] as const
    ).flatMap(([dir, dx, dy]) => [
      { id: `nudge.${dir}`, title: `Nudge ${dir} 1 px`, group: 'Layers', screens: cl, keys: [`arrow${dir}`], enabled: () => C().selectedIds.length > 0, run: () => C().nudgeSelected(dx, dy) },
      { id: `nudge.${dir}.far`, title: `Nudge ${dir} 10 px`, group: 'Layers', screens: cl, keys: [`shift+arrow${dir}`], enabled: () => C().selectedIds.length > 0, run: () => C().nudgeSelected(dx * 10, dy * 10) },
    ] satisfies Command[]),
    { id: 'view.cSnap', title: 'Toggle snapping to guides', group: 'View', screens: cl, keys: ['s'], run: () => C().setSnap(!C().snap) },
    { id: 'layer.group', title: 'Group selected layers', group: 'Layers', screens: cl, keys: ['mod+g'], enabled: () => C().selectedIds.length > 0, run: () => void C().groupSelected() },
    {
      id: 'layer.ungroup',
      title: 'Ungroup',
      group: 'Layers',
      screens: cl,
      keys: ['mod+shift+g'],
      enabled: () => C().designs[C().activeKind].some((l) => l.id === C().selectedId && l.type === 'group'),
      run: () => C().ungroupLayer(C().selectedId!),
    },
    { id: 'layer.text', title: 'Add text layer', group: 'Layers', screens: cl, keys: ['t'], run: () => C().addLayer('text') },
    { id: 'file.exportClothing', title: 'Export clothing…', group: 'File', screens: cl, run: () => useUI.getState().openModal('exportClothing') },

    // ---- palette only
    { id: 'file.new', title: 'New project…', group: 'File', screens: both, run: () => useUI.getState().openModal('new') },
    { id: 'file.open', title: 'Open project…', group: 'File', screens: both, run: () => useUI.getState().openModal('open') },
    { id: 'file.home', title: 'Go to the project list', group: 'File', screens: both, run: () => void goHome() },
    { id: 'file.backup', title: 'Download a backup of this project', group: 'File', screens: both, run: () => void downloadCurrentBackup() },
    {
      id: 'file.shrink',
      title: 'Shrink images in this project',
      group: 'File',
      screens: both,
      run: () => void import('../utils/shrink').then((m) => m.shrinkCurrentProjectImages()),
    },
    { id: 'app.settings', title: 'Settings', group: 'App', screens: both, run: () => useUI.getState().openModal('settings') },
    { id: 'app.privacy', title: 'Privacy and data', group: 'App', screens: both, run: () => useUI.getState().openModal('privacy') },
    { id: 'app.about', title: 'About', group: 'App', screens: both, run: () => useUI.getState().openModal('about') },
  ];
  return list;
}

export const PALETTE_COMBO = 'mod+k';

/** The keys a command answers to: the user's own choice if there is one, otherwise the defaults. "" means unbound. */
export function effectiveKeys(cmd: Command, overrides: Record<string, string>): string[] {
  if (Object.prototype.hasOwnProperty.call(overrides, cmd.id)) return overrides[cmd.id] ? [overrides[cmd.id]] : [];
  return cmd.keys ?? [];
}

export function findCommand(commands: Command[], combo: string, screen: CommandScreen, overrides: Record<string, string>): Command | undefined {
  return commands.find((c) => c.screens.includes(screen) && effectiveKeys(c, overrides).includes(combo));
}

/** Another command on the same screen already using `combo`, if any. */
export function conflictFor(commands: Command[], combo: string, cmdId: string, screen: CommandScreen, overrides: Record<string, string>): Command | undefined {
  return commands.find((c) => c.id !== cmdId && c.screens.includes(screen) && effectiveKeys(c, overrides).includes(combo));
}

/** Handles one key press. Returns true when it was used (so the caller can stop it). */
export function dispatchKey(e: KeyboardEvent & KeyLike, screen: CommandScreen, commands = getCommands()): boolean {
  const combo = comboFromEvent(e);
  if (!combo) return false;
  const ui = useUI.getState();
  const overrides = useSettings.getState().shortcuts;
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

  if (combo === PALETTE_COMBO) {
    ui.openModal(ui.modal === 'palette' ? null : 'palette');
    return true;
  }
  const cmd = findCommand(commands, combo, screen, overrides);
  if (!cmd) return false;
  if (!cmd.inInputs && (typing || ui.modal || ui.confirm || ui.prompt)) return false;
  if (cmd.enabled && !cmd.enabled()) return false;
  cmd.run();
  return true;
}

/** Matches a typed query against a command title: every word must appear, earlier and tighter matches rank higher. */
export function searchCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  const scored: [number, Command][] = [];
  for (const c of commands) {
    const hay = `${c.title} ${c.group}`.toLowerCase();
    let score = 0;
    let ok = true;
    for (const w of words) {
      const i = hay.indexOf(w);
      if (i < 0) {
        ok = false;
        break;
      }
      score += i === 0 || hay[i - 1] === ' ' ? 0 : 5; // prefer matches at the start of a word
      score += i / 20;
    }
    if (ok) scored.push([score, c]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map((s) => s[1]);
}

/** The overrides after rebinding `cmd` to `combo`. `null` goes back to the default, `""` unbinds. */
export function withBinding(overrides: Record<string, string>, cmd: Command, combo: string | null): Record<string, string> {
  const next = { ...overrides };
  const sameAsDefault = combo !== null && cmd.keys?.length === 1 && cmd.keys[0] === combo;
  if (combo === null || sameAsDefault) delete next[cmd.id];
  else next[cmd.id] = combo;
  return next;
}
