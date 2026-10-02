import { useEffect, useRef, useState } from 'react';
import { Copy, FileUp, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import { TEMPLATES, type ProjectTemplate } from '../assets/sample';
import { Modal } from '../components/ui/Overlays';
import { ProjectThumb } from '../components/ProjectThumb';
import { createAndOpen, listAll, openProject } from '../store/session';
import * as projects from '../store/projects';
import { useUI } from '../store/ui';
import { timeAgo } from '../utils/download';
import type { ProjectMeta } from '../types';

export function NewProjectModal({ onClose }: { onClose?: () => void }) {
  const closeModal = useUI((s) => s.closeModal);
  const close = onClose ?? closeModal;
  const [name, setName] = useState('Untitled project');
  const [template, setTemplate] = useState<ProjectTemplate>('blank');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);

  const create = async () => {
    close();
    await createAndOpen(name, template);
  };

  return (
    <Modal
      title="New project"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={create} disabled={!name.trim()}>
            Create project
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="np-name">Project name</label>
          <input id="np-name" ref={ref} className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
        </div>
        <div className="field">
          <span className="field-label">Start from</span>
          <div className="radio-cards three" role="radiogroup" aria-label="Template">
            {TEMPLATES.map((t) => (
              <button key={t.id} role="radio" aria-checked={template === t.id} className={`radio-card ${template === t.id ? 'on' : ''}`} onClick={() => setTemplate(t.id)}>
                <strong>{t.name}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function useProjectList() {
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    try {
      setList(await listAll());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read projects from browser storage.');
      setList([]);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return { list, error, refresh };
}

export async function importProjectFromDisk(): Promise<ProjectMeta | null> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  const file = await new Promise<File | undefined>((resolve) => {
    input.onchange = () => resolve(input.files?.[0]);
    input.oncancel = () => resolve(undefined);
    input.click();
  });
  if (!file) return null;
  try {
    const meta = await projects.importProjectFile(await file.text());
    useUI.getState().toast('success', `Imported “${meta.name}”`);
    return meta;
  } catch (e) {
    useUI.getState().toast('error', e instanceof Error ? e.message : 'Could not import this file.');
    return null;
  }
}

export function ProjectActions({ meta, onChanged, onOpen }: { meta: ProjectMeta; onChanged: () => void; onOpen: () => void }) {
  const askText = useUI((s) => s.askText);
  const askConfirm = useUI((s) => s.askConfirm);
  const toast = useUI((s) => s.toast);
  return (
    <div className="proj-actions">
      <button className="icon-btn sm" title="Open" aria-label={`Open ${meta.name}`} onClick={onOpen}>
        <FolderOpen size={13} />
      </button>
      <button
        className="icon-btn sm"
        title="Rename"
        aria-label={`Rename ${meta.name}`}
        onClick={() =>
          askText({
            title: 'Rename project',
            label: 'Project name',
            initial: meta.name,
            confirmLabel: 'Rename',
            onSubmit: async (v) => {
              await projects.renameProject(meta.id, v);
              onChanged();
            },
          })
        }
      >
        <Pencil size={13} />
      </button>
      <button
        className="icon-btn sm"
        title="Duplicate"
        aria-label={`Duplicate ${meta.name}`}
        onClick={async () => {
          const c = await projects.duplicateProject(meta.id);
          if (c) toast('success', `Duplicated as “${c.name}”`);
          onChanged();
        }}
      >
        <Copy size={13} />
      </button>
      <button
        className="icon-btn sm"
        title="Delete"
        aria-label={`Delete ${meta.name}`}
        onClick={() =>
          askConfirm({
            title: `Delete “${meta.name}”?`,
            body: 'This removes the project from this browser. It cannot be undone.',
            confirmLabel: 'Delete project',
            danger: true,
            onConfirm: async () => {
              await projects.deleteProject(meta.id);
              toast('info', `Deleted “${meta.name}”`);
              onChanged();
            },
          })
        }
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export function OpenProjectModal({ onClose }: { onClose?: () => void }) {
  const closeModal = useUI((s) => s.closeModal);
  const close = onClose ?? closeModal;
  const { list, error, refresh } = useProjectList();

  return (
    <Modal
      title="Open project"
      size="wide"
      onClose={close}
      footer={
        <>
          <button
            className="btn"
            onClick={async () => {
              const m = await importProjectFromDisk();
              if (m) await refresh();
            }}
          >
            <FileUp size={14} /> Import project file
          </button>
          <div className="grow" />
          <button className="btn" onClick={close}>
            Close
          </button>
        </>
      }
    >
      {list === null && (
        <div className="empty">
          <div className="spinner" />
          <span>Loading projects…</span>
        </div>
      )}
      {error && <div className="alert err">{error}</div>}
      {list?.length === 0 && !error && (
        <div className="empty">
          <strong>No saved projects</strong>
          <span>Create one with New project, or import a project file.</span>
        </div>
      )}
      <div className="proj-list">
        {list?.map((p) => (
          <div
            key={p.id}
            className="proj-row"
            onDoubleClick={async () => {
              close();
              await openProject(p.id);
            }}
          >
            <ProjectThumb src={p.thumbnail} className="proj-row-thumb" />
            <div className="grow">
              <div className="proj-name truncate">{p.name}</div>
              <div className="hint">
                Updated {timeAgo(p.updatedAt)} · {p.objectCount} object{p.objectCount === 1 ? '' : 's'}
              </div>
            </div>
            <ProjectActions
              meta={p}
              onChanged={refresh}
              onOpen={async () => {
                close();
                await openProject(p.id);
              }}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
