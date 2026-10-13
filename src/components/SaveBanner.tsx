import { Download, HardDrive, RefreshCw, Shrink, TriangleAlert, X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useClothing } from '../store/clothing';
import { downloadCurrentBackup, saveNow } from '../store/session';
import { useUI } from '../store/ui';
import { formatBytes } from '../utils/privacy';
import { shrinkCurrentProjectImages } from '../utils/shrink';
import { LARGE_PROJECT_BYTES, storageNeedsAttention, useStorageHealth } from '../utils/storageHealth';

/**
 * Two things worth interrupting for: a project that could not be saved (with a one-click backup),
 * and browser storage running out (with a way to shrink the project).
 */
export function SaveBanner() {
  const screen = useEditor((s) => s.screen);
  const status = useEditor((s) => s.project.saveStatus);
  const name = useEditor((s) => s.project.name);
  const hasTextures = useEditor((s) => s.textures.length > 0);
  const hasImages = useClothing((s) => s.images.length > 0);
  const level = useStorageHealth((s) => s.level);
  const used = useStorageHealth((s) => s.used);
  const quota = useStorageHealth((s) => s.quota);
  const projectBytes = useStorageHealth((s) => s.projectBytes);
  const dismissed = useStorageHealth((s) => s.dismissed);
  const dismiss = useStorageHealth((s) => s.dismiss);
  const openModal = useUI((s) => s.openModal);

  const inProject = screen === 'editor' || screen === 'clothing';
  const canShrink = inProject && (screen === 'clothing' ? hasImages : hasTextures);

  if (inProject && status === 'error') {
    return (
      <div className="save-banner err" role="alert">
        <TriangleAlert size={16} />
        <div className="save-banner-text">
          <strong>“{name}” could not be saved.</strong>
          <span>Your latest changes only exist in this tab. Download a backup now, then try again.</span>
        </div>
        <button className="btn sm primary" onClick={() => downloadCurrentBackup()}>
          <Download size={13} /> Download backup
        </button>
        <button className="btn sm" onClick={() => void saveNow(true)}>
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }

  if (!storageNeedsAttention({ level, projectBytes, dismissed })) return null;
  const pct = used !== null && quota ? Math.round((used / quota) * 100) : null;
  const critical = level === 'critical';
  const bigProject = projectBytes >= LARGE_PROJECT_BYTES;
  return (
    <div className={`save-banner ${critical ? 'err' : 'warn'}`} role="status">
      <HardDrive size={16} />
      <div className="save-banner-text">
        <strong>{level !== 'ok' ? (critical ? 'Browser storage is almost full.' : 'Browser storage is getting full.') : 'This project is large.'}</strong>
        <span>
          {level !== 'ok' && pct !== null ? `Using ${formatBytes(used)} of about ${formatBytes(quota)} (${pct}%). ` : ''}
          {bigProject ? `This project is about ${formatBytes(projectBytes)}, mostly images. ` : ''}
          {critical ? 'Saving may fail soon.' : 'Shrinking images or backing up and deleting old projects frees space.'}
        </span>
      </div>
      {canShrink && (
        <button className="btn sm primary" onClick={() => void shrinkCurrentProjectImages()}>
          <Shrink size={13} /> Shrink images
        </button>
      )}
      {inProject && (
        <button className="btn sm" onClick={() => downloadCurrentBackup()}>
          <Download size={13} /> Backup
        </button>
      )}
      <button className="btn sm" onClick={() => openModal('privacy')}>
        Manage storage
      </button>
      <button className="icon-btn sm" aria-label="Dismiss" onClick={dismiss}>
        <X size={13} />
      </button>
    </div>
  );
}
