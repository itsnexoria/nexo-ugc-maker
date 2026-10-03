import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Eye, FilePlus2, FolderOpen, HelpCircle, Home, Info, Keyboard, Pencil, Redo2, Save, Settings, Trash2, Undo2, Upload, User } from 'lucide-react';
import { createElement } from 'react';
import { useEditor } from '../store/editor';
import { useClothing } from '../store/clothing';
import { useSettings } from '../store/settings';
import { useUI, type MenuItem } from '../store/ui';
import { useViewport } from '../store/viewport';
import { duplicateCurrent, goHome, saveNow } from '../store/session';
import * as projects from '../store/projects';
import { downloadBlob, safeFilename, timeAgo } from '../utils/download';
import { BrandMark, Wordmark } from './Brand';
import { Tip } from './ui/Tooltip';

const ic = (C: typeof Copy) => createElement(C, { size: 13 });

function SaveStatus() {
  const status = useEditor((s) => s.project.saveStatus);
  const savedAt = useEditor((s) => s.project.lastSavedAt);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 20000);
    return () => clearInterval(t);
  }, []);
  const label =
    status === 'saving' ? 'Saving…' : status === 'unsaved' ? 'Unsaved changes' : status === 'error' ? 'Save failed' : `Saved ${timeAgo(savedAt)}`;
  const tone = status === 'saved' ? 'ok' : status === 'error' ? 'err' : status === 'saving' ? '' : 'warn';
  return (
    <span className="save-status" role="status">
      <span className={`status-dot ${tone}`} />
      <span className="dim">{label}</span>
    </span>
  );
}

function ProjectName() {
  const name = useEditor((s) => s.project.name);
  const setName = useEditor((s) => s.setProjectName);
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = () => {
      setDraft(name);
      setTimeout(() => ref.current?.select(), 0);
    };
    window.addEventListener('nexo:rename-project', h);
    return () => window.removeEventListener('nexo:rename-project', h);
  }, [name]);

  return (
    <input
      ref={ref}
      className="project-name"
      aria-label="Project name"
      value={draft ?? name}
      maxLength={60}
      spellCheck={false}
      onFocus={(e) => setDraft(name) ?? e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim() && draft.trim() !== name) setName(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
        e.stopPropagation();
      }}
    />
  );
}

export function TopBar({ mode = 'accessory' }: { mode?: 'accessory' | 'clothing' }) {
  const clothing = mode === 'clothing';
  const canUndo = useEditor((s) => s.past.length > 0) && !clothing;
  const canRedo = useEditor((s) => s.future.length > 0) && !clothing;
  const accUndo = useEditor((s) => s.undo);
  const accRedo = useEditor((s) => s.redo);
  const clUndo = useClothing((s) => s.undo);
  const clRedo = useClothing((s) => s.redo);
  const clCanUndo = useClothing((s) => s.past.length > 0);
  const clCanRedo = useClothing((s) => s.future.length > 0);
  const undo = clothing ? clUndo : accUndo;
  const redo = clothing ? clRedo : accRedo;
  const preview = useViewport((s) => s.previewMode);
  const setPreview = useViewport((s) => s.setPreviewMode);
  const openModal = useUI((s) => s.openModal);
  const openMenu = useUI((s) => s.openContextMenu);
  const name = useSettings((s) => s.displayName);

  const projectMenu = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const ed = useEditor.getState();
    const items: MenuItem[] = [
      { label: 'New project…', icon: ic(FilePlus2), onClick: () => openModal('new') },
      { label: 'Open project…', icon: ic(FolderOpen), onClick: () => openModal('open') },
      { separator: true },
      { label: 'Save', icon: ic(Save), shortcut: 'Ctrl+S', onClick: () => void saveNow(true) },
      { label: 'Duplicate project', icon: ic(Copy), onClick: () => void duplicateCurrent() },
      { label: 'Rename project', icon: ic(Pencil), onClick: () => window.dispatchEvent(new Event('nexo:rename-project')) },
      {
        label: 'Download project file',
        icon: ic(Download),
        onClick: () => {
          const text = projects.toProjectFile(ed.project.name, ed.serialize());
          downloadBlob(new Blob([text], { type: 'application/json' }), `${safeFilename(ed.project.name)}.nexougc.json`);
        },
      },
      { separator: true },
      {
        label: 'Delete project',
        icon: ic(Trash2),
        danger: true,
        onClick: () =>
          useUI.getState().askConfirm({
            title: `Delete “${ed.project.name}”?`,
            body: 'The project and its textures are removed from this browser. This cannot be undone. Download a project file first if you want a backup.',
            confirmLabel: 'Delete project',
            danger: true,
            onConfirm: async () => {
              await projects.deleteProject(ed.project.id);
              useEditor.getState().setScreen('home');
              useUI.getState().toast('info', `Deleted “${ed.project.name}”`);
            },
          }),
      },
      { separator: true },
      { label: 'All projects', icon: ic(Home), onClick: () => void goHome() },
    ];
    openMenu(r.left, r.bottom + 4, items);
  };

  const profileMenu = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(Math.max(8, r.right - 210), r.bottom + 4, [
      { label: `Signed in locally as ${name}`, disabled: true, icon: ic(User) },
      { separator: true },
      { label: 'Keyboard shortcuts', icon: ic(Keyboard), shortcut: '?', onClick: () => openModal('shortcuts') },
      { label: 'Settings', icon: ic(Settings), onClick: () => openModal('settings') },
      { label: 'About Nexo UGC Studio', icon: ic(Info), onClick: () => openModal('about') },
    ]);
  };

  return (
    <header className="topbar">
      <div className="tb-left">
        <button className="brand-btn" onClick={() => void goHome()} aria-label="All projects">
          <BrandMark size={24} />
          <Wordmark />
        </button>
        <span className="divider" />
        <ProjectName />
        <Tip label="Project menu">
          <button className="icon-btn" onClick={projectMenu} aria-label="Project menu" aria-haspopup="menu">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </Tip>
        <SaveStatus />
      </div>

      <div className="tb-center">
        <Tip label="Undo" shortcut="Ctrl+Z">
          <button className="btn ghost" disabled={clothing ? !clCanUndo : !canUndo} onClick={undo} aria-label="Undo">
            <Undo2 size={15} /> Undo
          </button>
        </Tip>
        <Tip label="Redo" shortcut="Ctrl+Y">
          <button className="btn ghost" disabled={clothing ? !clCanRedo : !canRedo} onClick={redo} aria-label="Redo">
            <Redo2 size={15} /> Redo
          </button>
        </Tip>
        <span className="divider" />
        <Tip label="Save project" shortcut="Ctrl+S">
          <button className="btn ghost" onClick={() => void saveNow(true)} aria-label="Save">
            <Save size={15} /> Save
          </button>
        </Tip>
        {!clothing && (
        <Tip label="Clean preview with animation" shortcut="P">
          <button
            className={`btn ghost ${preview ? 'is-on' : ''}`}
            onClick={() => {
              setPreview(!preview);
              if (!preview && useEditor.getState().animation === 'rest') useEditor.getState().setAnimation('idle');
            }}
            aria-pressed={preview}
          >
            <Eye size={15} /> Preview
          </button>
        </Tip>
        )}
      </div>

      <div className="tb-right">
        <button className="btn primary" onClick={() => openModal(clothing ? 'exportClothing' : 'export')}>
          <Upload size={14} /> Export
        </button>
        <Tip label="Settings">
          <button className="icon-btn" onClick={() => openModal('settings')} aria-label="Settings">
            <Settings size={16} />
          </button>
        </Tip>
        <Tip label="Help and shortcuts" shortcut="?">
          <button className="icon-btn" onClick={() => openModal('shortcuts')} aria-label="Help and shortcuts">
            <HelpCircle size={16} />
          </button>
        </Tip>
        <button className="avatar-btn" onClick={profileMenu} aria-label="Profile menu" aria-haspopup="menu">
          {name.trim().slice(0, 1).toUpperCase() || 'C'}
        </button>
      </div>
    </header>
  );
}
