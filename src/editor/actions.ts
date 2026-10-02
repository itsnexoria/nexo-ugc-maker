import { Copy, Crosshair, Eye, EyeOff, Lock, LockOpen, Pencil, Trash2, ArrowUpFromLine } from 'lucide-react';
import { createElement } from 'react';
import { useEditor } from '../store/editor';
import { useSettings } from '../store/settings';
import { useUI, type MenuItem } from '../store/ui';
import { viewportApi } from '../viewport/api';
import { subtreeIds } from '../utils/scene';

const ic = (C: typeof Copy) => createElement(C, { size: 13 });

export function requestDelete(id: string): void {
  const ed = useEditor.getState();
  const obj = ed.objects[id];
  if (!obj) return;
  const count = subtreeIds(ed.objects, ed.order, id).length;
  const run = () => {
    useEditor.getState().removeObject(id);
    useUI.getState().toast('info', `Deleted ${obj.name}`, { label: 'Undo', onClick: () => useEditor.getState().undo() });
  };
  if (obj.kind === 'group' && count > 1 && useSettings.getState().confirmDelete) {
    useUI.getState().askConfirm({
      title: `Delete ${obj.name}?`,
      body: `This removes the group and its ${count - 1} part${count - 1 === 1 ? '' : 's'}. You can undo it with Ctrl+Z.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: run,
    });
  } else run();
}

export function focusSelection(): void {
  const ed = useEditor.getState();
  const rootIds = ed.childrenIndex.root ?? [];
  if (!viewportApi.focus(ed.selectedId, rootIds)) useUI.getState().toast('warn', 'Nothing to focus on yet.');
}

export function duplicateSelection(): void {
  const ed = useEditor.getState();
  if (ed.selectedId) ed.duplicateObject(ed.selectedId);
}

export function startRename(id: string): void {
  window.dispatchEvent(new CustomEvent('nexo:rename', { detail: id }));
}

export function objectMenu(id: string): MenuItem[] {
  const ed = useEditor.getState();
  const o = ed.objects[id];
  if (!o) return [];
  return [
    { label: 'Focus', icon: ic(Crosshair), shortcut: 'F', onClick: () => { ed.select(id); focusSelection(); } },
    { label: 'Rename', icon: ic(Pencil), shortcut: 'F2', onClick: () => startRename(id) },
    { label: 'Duplicate', icon: ic(Copy), shortcut: 'Ctrl+D', onClick: () => { ed.select(id); duplicateSelection(); } },
    { separator: true },
    { label: o.visible ? 'Hide' : 'Show', icon: ic(o.visible ? EyeOff : Eye), onClick: () => ed.toggleVisible(id) },
    { label: o.locked ? 'Unlock' : 'Lock', icon: ic(o.locked ? LockOpen : Lock), onClick: () => ed.toggleLock(id) },
    {
      label: 'Select parent group',
      icon: ic(ArrowUpFromLine),
      disabled: !o.parentId,
      onClick: () => o.parentId && ed.select(o.parentId),
    },
    {
      label: 'Move out of group',
      disabled: !o.parentId,
      onClick: () => ed.reparent(id, null),
    },
    { separator: true },
    { label: 'Delete', icon: ic(Trash2), shortcut: 'Del', danger: true, onClick: () => requestDelete(id) },
  ];
}
