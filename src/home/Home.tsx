import { useState } from 'react';
import { FilePlus2, FileUp, FolderOpen, Settings } from 'lucide-react';
import { BrandMark, Wordmark } from '../components/Brand';
import { ProjectThumb } from '../components/ProjectThumb';
import { NewProjectModal, OpenProjectModal, ProjectActions, importProjectFromDisk, useProjectList } from '../modals/ProjectModals';
import { openProject } from '../store/session';
import { useUI } from '../store/ui';
import { timeAgo } from '../utils/download';

export function Home() {
  const { list, error, refresh } = useProjectList();
  const [dialog, setDialog] = useState<'new' | 'open' | null>(null);
  const openModal = useUI((s) => s.openModal);

  return (
    <main className="home">
      <section className="home-side">
        <div className="home-brand">
          <BrandMark size={72} />
          <div>
            <Wordmark />
            <div className="by">BY NEXORIA</div>
          </div>
        </div>
        <h1>Nexo UGC Studio</h1>
        <p className="tagline">Create. Customize. Export.</p>
        <p className="dim home-copy">Build Roblox accessories from primitive shapes, try them on an R6 or R15 mannequin, check them against Roblox's limits, and export GLB, glTF or OBJ.</p>
        <div className="col" style={{ gap: 8, marginTop: 8, alignItems: 'flex-start' }}>
          <button className="btn primary lg" onClick={() => setDialog('new')}>
            <FilePlus2 size={16} /> New Project
          </button>
          <button className="btn lg" onClick={() => setDialog('open')}>
            <FolderOpen size={16} /> Open Project
          </button>
          <button
            className="btn ghost"
            onClick={async () => {
              const m = await importProjectFromDisk();
              if (m) await refresh();
            }}
          >
            <FileUp size={14} /> Import project file
          </button>
        </div>
        <div className="home-foot">
          <button className="btn ghost sm" onClick={() => openModal('settings')}>
            <Settings size={13} /> Settings
          </button>
          <button className="btn ghost sm" onClick={() => openModal('about')}>
            About
          </button>
          <span className="faint">Projects are saved in this browser only.</span>
        </div>
      </section>

      <section className="home-main">
        <div className="home-head">
          <h2>Recent Projects</h2>
          {list && list.length > 0 && <span className="faint">{list.length} saved</span>}
        </div>
        {list === null && (
          <div className="empty">
            <div className="spinner" />
            <span>Loading projects…</span>
          </div>
        )}
        {error && <div className="alert err">{error}</div>}
        {list?.length === 0 && !error && (
          <div className="empty">
            <strong>No projects yet</strong>
            <span>Create your first accessory with New Project.</span>
          </div>
        )}
        <div className="home-grid">
          {list?.map((p) => (
            <article key={p.id} className="proj-card">
              <button className="proj-open" onClick={() => void openProject(p.id)} aria-label={`Open ${p.name}`}>
                <ProjectThumb src={p.thumbnail} />
                <div className="proj-meta">
                  <div className="proj-name truncate">{p.name}</div>
                  <div className="hint">
                    Updated {timeAgo(p.updatedAt)} · {p.objectCount} object{p.objectCount === 1 ? '' : 's'}
                  </div>
                </div>
              </button>
              <ProjectActions meta={p} onChanged={refresh} onOpen={() => void openProject(p.id)} />
            </article>
          ))}
        </div>
      </section>

      {dialog === 'new' && <NewProjectModal onClose={() => setDialog(null)} />}
      {dialog === 'open' && <OpenProjectModal onClose={() => setDialog(null)} />}
    </main>
  );
}
