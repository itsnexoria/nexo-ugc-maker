import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Box, ChevronDown, ChevronRight, Eye, EyeOff, FolderTree, Lock, LockOpen, User } from 'lucide-react';
import { objectMenu } from '../editor/actions';
import { BONES, type BoneDef } from '../assets/avatar';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { SHAPE_LABELS } from '../utils/geometry';

function useRenameEvent(id: string, begin: () => void) {
  useEffect(() => {
    const h = (e: Event) => (e as CustomEvent<string>).detail === id && begin();
    window.addEventListener('nexo:rename', h);
    return () => window.removeEventListener('nexo:rename', h);
  }, [id, begin]);
}

function ObjectRow({ id, depth }: { id: string; depth: number }) {
  const obj = useEditor((s) => s.objects[id]);
  const kids = useEditor((s) => s.childrenIndex[id]);
  const selected = useEditor((s) => s.selectedId === id);
  const layerHidden = useEditor((s) => {
    const o = s.objects[id];
    return o ? !(s.layers.find((l) => l.id === o.layerId)?.visible ?? true) : false;
  });
  const select = useEditor((s) => s.select);
  const toggleVisible = useEditor((s) => s.toggleVisible);
  const toggleLock = useEditor((s) => s.toggleLock);
  const rename = useEditor((s) => s.renameObject);
  const reparent = useEditor((s) => s.reparent);
  const openMenu = useUI((s) => s.openContextMenu);
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useRenameEvent(id, () => setEditing(obj?.name ?? ''));

  // keep the selected row visible
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!obj) return null;
  const isGroup = obj.kind === 'group';
  const hasKids = !!kids?.length;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const dragged = e.dataTransfer.getData('text/nexo-object');
    if (dragged && isGroup) reparent(dragged, id);
  };

  return (
    <>
      <div
        ref={rowRef}
        className={`tree-row ${selected ? 'selected' : ''} ${over ? 'drop' : ''} ${!obj.visible || layerHidden ? 'muted' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={!obj.locked}
        onDragStart={(e) => e.dataTransfer.setData('text/nexo-object', id)}
        onDragOver={(e) => {
          if (isGroup && e.dataTransfer.types.includes('text/nexo-object')) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => select(id)}
        onDoubleClick={() => setEditing(obj.name)}
        onContextMenu={(e) => {
          e.preventDefault();
          select(id);
          openMenu(e.clientX, e.clientY, objectMenu(id));
        }}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasKids ? open : undefined}
      >
        <button
          className="icon-btn sm twisty"
          aria-label={open ? 'Collapse' : 'Expand'}
          style={{ visibility: hasKids ? 'visible' : 'hidden' }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="tree-icon">{isGroup ? <FolderTree size={13} /> : <Box size={13} />}</span>
        {editing !== null ? (
          <input
            className="tree-input"
            autoFocus
            value={editing}
            maxLength={48}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setEditing(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              if (editing.trim() && editing !== obj.name) rename(id, editing);
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(null);
              e.stopPropagation();
            }}
          />
        ) : (
          <span className="tree-name truncate" title={`${obj.name} — ${SHAPE_LABELS[obj.kind]}`}>
            {obj.name}
          </span>
        )}
        <span className="tree-actions">
          <button className={`icon-btn sm ${obj.locked ? 'on' : ''}`} aria-label={obj.locked ? 'Unlock' : 'Lock'} onClick={(e) => (e.stopPropagation(), toggleLock(id))}>
            {obj.locked ? <Lock size={12} /> : <LockOpen size={12} />}
          </button>
          <button className={`icon-btn sm ${!obj.visible ? 'on' : ''}`} aria-label={obj.visible ? 'Hide' : 'Show'} onClick={(e) => (e.stopPropagation(), toggleVisible(id))}>
            {obj.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </span>
      </div>
      {open && kids?.map((k) => <ObjectRow key={k} id={k} depth={depth + 1} />)}
    </>
  );
}

function BoneRow({ bone, depth, children }: { bone: BoneDef; depth: number; children: BoneDef[] }) {
  const selected = useEditor((s) => s.selectedAvatarPart === bone.name);
  const select = useEditor((s) => s.selectAvatarPart);
  const rig = useEditor((s) => s.rig);
  return (
    <>
      <div className={`tree-row bone ${selected ? 'selected' : ''}`} style={{ paddingLeft: 6 + depth * 14 }} onClick={() => select(bone.name)} role="treeitem" aria-selected={selected}>
        <span className="twisty-gap" />
        <span className="tree-icon">
          <User size={12} />
        </span>
        <span className="tree-name truncate">{bone.name.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
        <span className="tree-meta faint">locked</span>
      </div>
      {children.map((c) => (
        <BoneRow key={c.name} bone={c} depth={depth + 1} children={BONES[rig].filter((b) => b.parent === c.name)} />
      ))}
    </>
  );
}

export function SceneTab() {
  const roots = useEditor((s) => s.childrenIndex.root);
  const rig = useEditor((s) => s.rig);
  const reparent = useEditor((s) => s.reparent);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const bones = BONES[rig];
  const rootBones = bones.filter((b) => !b.parent);

  return (
    <div className="tree" role="tree" aria-label="Scene hierarchy">
      <div className="tree-row header" style={{ paddingLeft: 6 }} onClick={() => setOpen((o) => !o)}>
        <button className="icon-btn sm twisty" aria-label="Toggle avatar">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="tree-icon">
          <User size={13} />
        </span>
        <strong className="tree-name">Avatar ({rig})</strong>
      </div>
      {open && rootBones.map((b) => <BoneRow key={b.name} bone={b} depth={1} children={bones.filter((x) => x.parent === b.name)} />)}
      <div
        className={`tree-row header ${over ? 'drop' : ''}`}
        style={{ paddingLeft: 20 }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/nexo-object')) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const id = e.dataTransfer.getData('text/nexo-object');
          if (id) reparent(id, null);
        }}
      >
        <span className="tree-icon">
          <FolderTree size={13} />
        </span>
        <strong className="tree-name">UGC</strong>
        <span className="tree-meta faint">drop here to ungroup</span>
      </div>
      {roots?.length ? (
        roots.map((id) => <ObjectRow key={id} id={id} depth={2} />)
      ) : (
        <div className="empty" style={{ minHeight: 60 }}>
          <span>No UGC parts yet. Add one from the toolbox or the Assets tab.</span>
        </div>
      )}
    </div>
  );
}
