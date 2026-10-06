import { useEffect, useState } from 'react';
import { Download, HardDrive, ShieldCheck, Trash2, WifiOff } from 'lucide-react';
import { Modal } from '../components/ui/Overlays';
import { downloadBlob } from '../utils/download';
import { backupAllProjects, deleteAllLocalData, formatBytes, requestPersistence, storageInfo, type StorageInfo } from '../utils/privacy';
import { usePwa } from '../utils/pwa';
import { useUI } from '../store/ui';

export function PrivacyModal() {
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const askConfirm = useUI((s) => s.askConfirm);
  const offlineReady = usePwa((s) => s.offlineReady);
  const installed = usePwa((s) => s.installed);
  const canInstall = usePwa((s) => s.canInstall);
  const install = usePwa((s) => s.install);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const refresh = () => void storageInfo().then(setInfo);
  useEffect(refresh, []);

  return (
    <Modal title="Privacy and your data" onClose={close}>
      <div className="col" style={{ gap: 16 }}>
        <div className="trust-row">
          <ShieldCheck size={18} color="var(--ok)" />
          <div>
            <strong>Everything stays on this device.</strong>
            <p className="dim">
              Nexo UGC Studio has no accounts, no analytics, no ads and no tracking. Your projects, images and models are saved in this browser (IndexedDB) and are never uploaded. The app only loads its own files, and you can use it offline.
            </p>
          </div>
        </div>

        <div className="trust-row">
          <HardDrive size={18} color="var(--info)" />
          <div className="col" style={{ gap: 6 }}>
            <strong>Storage</strong>
            <p className="dim">
              Using {formatBytes(info?.usedBytes ?? null)} of about {formatBytes(info?.quotaBytes ?? null)} available.{' '}
              {info?.persisted === true ? 'Your browser has agreed to keep this data.' : info?.persisted === false ? 'Browsers can clear site data when the disk is nearly full or when you clear your history.' : ''}
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {info?.persisted === false && (
                <button
                  className="btn sm"
                  onClick={async () => {
                    const ok = await requestPersistence();
                    toast(ok ? 'success' : 'warn', ok ? 'Your browser will try to keep your projects.' : 'Your browser did not agree. Download a backup instead.');
                    refresh();
                  }}
                >
                  Ask the browser to keep my data
                </button>
              )}
              <button
                className="btn sm"
                onClick={async () => {
                  const r = await backupAllProjects();
                  if (!r) return toast('info', 'There are no saved projects to back up yet.');
                  downloadBlob(r.blob, 'nexo-ugc-backup.zip');
                  toast('success', `Backed up ${r.count} project${r.count === 1 ? '' : 's'}`);
                }}
              >
                <Download size={13} /> Download a backup of all projects
              </button>
            </div>
            <p className="hint">Clearing your browser's site data deletes your projects. A backup file can be restored with Import project file.</p>
          </div>
        </div>

        <div className="trust-row">
          <WifiOff size={18} color="var(--text-dim)" />
          <div className="col" style={{ gap: 6 }}>
            <strong>Offline and install</strong>
            <p className="dim">{offlineReady ? 'The app is saved for offline use.' : 'Offline use turns on after the first visit finishes loading (it needs a secure https page).'}</p>
            {canInstall && !installed && (
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => void install()}>
                Install as an app
              </button>
            )}
            {installed && <p className="hint">Installed as an app on this device.</p>}
          </div>
        </div>

        <div className="trust-row">
          <Trash2 size={18} color="var(--err)" />
          <div className="col" style={{ gap: 6 }}>
            <strong>Delete everything</strong>
            <p className="dim">Removes all projects, saved assets, settings and the offline copy from this browser.</p>
            <button
              className="btn sm danger"
              style={{ alignSelf: 'flex-start' }}
              onClick={() =>
                askConfirm({
                  title: 'Delete all local data?',
                  body: 'Every project, saved asset and setting in this browser will be permanently removed. Download a backup first if you want to keep anything. This cannot be undone.',
                  confirmLabel: 'Delete everything',
                  danger: true,
                  onConfirm: async () => {
                    await deleteAllLocalData();
                    window.location.reload();
                  },
                })
              }
            >
              Delete all local data
            </button>
          </div>
        </div>
        <p className="hint">Roblox is a trademark of Roblox Corporation. Nexo UGC Studio is an independent tool and is not affiliated with or endorsed by Roblox.</p>
      </div>
    </Modal>
  );
}
