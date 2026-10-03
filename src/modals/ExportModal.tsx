import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Info, XCircle } from 'lucide-react';
import { Modal } from '../components/ui/Overlays';
import { useValidation } from '../hooks/useValidation';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { downloadBlob, safeFilename } from '../utils/download';
import { runExport, UNIT_SCALE, type ExportFormat, type ExportUnits } from '../utils/exporter';

const FORMATS: { id: ExportFormat; name: string; note: string }[] = [
  { id: 'glb', name: 'GLB', note: 'One binary file with geometry, materials and textures. Best for Blender and Roblox Studio.' },
  { id: 'gltf', name: 'glTF', note: 'Same data as GLB, as readable JSON with the buffers embedded.' },
  { id: 'obj', name: 'OBJ', note: 'ZIP with .obj, .mtl and texture files. Parts keep their own materials; hierarchy is flattened.' },
];

export function ExportModal() {
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const projectName = useEditor((s) => s.project.name);
  const report = useValidation();
  const [format, setFormat] = useState<ExportFormat>('glb');
  const [units, setUnits] = useState<ExportUnits>('studs');
  const [avatar, setAvatar] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [filename, setFilename] = useState(safeFilename(projectName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocking = report.errors > 0;
  const issues = useMemo(() => report.results.filter((r) => r.severity === 'error' || r.severity === 'warn'), [report]);

  const doExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = useEditor.getState();
      const result = await runExport(
        { objects: s.objects, order: s.order, layers: s.layers, textures: s.textures, models: s.models, rig: s.rig },
        { format, units, includeAvatar: avatar, includeHidden: hidden, filename: filename.trim() || 'accessory' },
      );
      downloadBlob(result.blob, result.filename);
      toast('success', `Exported ${result.filename} (${result.parts} parts, ${result.triangles.toLocaleString()} triangles)`);
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Export failed.';
      setError(msg);
      useUI.getState().log('error', `Export failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export"
      size="wide"
      onClose={close}
      footer={
        <>
          <span className="hint grow">{blocking ? 'Fix the errors in the Validation tab, or export anyway to inspect the geometry.' : 'Ready to export.'}</span>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={doExport} disabled={busy}>
            {busy ? 'Exporting…' : blocking ? 'Export anyway' : `Export ${format.toUpperCase()}`}
          </button>
        </>
      }
    >
      <div className="export-grid">
        <div className="col" style={{ gap: 14 }}>
          <div className="field">
            <span className="field-label">Format</span>
            <div className="radio-cards" role="radiogroup" aria-label="Export format">
              {FORMATS.map((f) => (
                <button key={f.id} role="radio" aria-checked={format === f.id} className={`radio-card ${format === f.id ? 'on' : ''}`} onClick={() => setFormat(f.id)}>
                  <strong>{f.name}</strong>
                  <span>{f.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="exp-name">File name</label>
            <input id="exp-name" className="input" value={filename} maxLength={48} onChange={(e) => setFilename(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="exp-units">Units</label>
            <select id="exp-units" className="select" value={units} onChange={(e) => setUnits(e.target.value as ExportUnits)}>
              <option value="studs">Studs (1 unit = 1 stud)</option>
              <option value="meters">Meters (1 stud = {UNIT_SCALE.meters} m)</option>
              <option value="centimeters">Centimeters (1 stud = {UNIT_SCALE.centimeters} cm)</option>
            </select>
          </div>
          <label className="check">
            <input type="checkbox" checked={avatar} onChange={(e) => setAvatar(e.target.checked)} /> Include the avatar mannequin as a reference
          </label>
          <label className="check">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Include hidden parts and layers
          </label>

          <div className="export-summary">
            <div>
              <span className="dim">Parts</span> <span className="num">{report.meshCount}</span>
            </div>
            <div>
              <span className="dim">Triangles</span> <span className="num">{report.triangles.toLocaleString()}</span>
            </div>
            <div>
              <span className="dim">Size</span>{' '}
              <span className="num">{report.size ? report.size.map((n) => Math.round(n * UNIT_SCALE[units] * 100) / 100).join(' × ') : '—'} {units === 'studs' ? 'studs' : units === 'meters' ? 'm' : 'cm'}</span>
            </div>
          </div>

          {issues.length > 0 && (
            <ul className="issue-list" aria-label="Validation issues">
              {issues.map((r) => (
                <li key={r.id}>
                  {r.severity === 'error' ? <XCircle size={14} color="var(--err)" /> : <AlertTriangle size={14} color="var(--warn)" />}
                  <span>
                    <strong>{r.title}.</strong> {r.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <div className="alert err" role="alert">
              <XCircle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="col roblox" style={{ gap: 12 }}>
          <h3 className="panel-title">Roblox workflow</h3>
          <p className="dim">
            This tool exports standard 3D files. It does <strong>not</strong> create a Roblox asset, an <code>.rbxm</code>/<code>.rbxmx</code> file, or upload anything. Roblox Studio and the Creator Hub finish the job.
          </p>

          <div className="two-lists">
            <div>
              <div className="list-title ok">
                <CheckCircle2 size={14} /> Done here
              </div>
              <ul>
                <li>Real {format.toUpperCase()} geometry with names, transforms and units</li>
                <li>Materials (colour, metal, roughness, glow) and textures</li>
                <li>Triangle, size and texture checks against Roblox's published limits</li>
              </ul>
            </div>
            <div>
              <div className="list-title warn">
                <Info size={14} /> Still needed in Roblox
              </div>
              <ul>
                <li>One joined mesh and one baked texture</li>
                <li>Attachment point and fit on the avatar</li>
                <li>Roblox validation, moderation and upload</li>
              </ul>
            </div>
          </div>

          <ol className="steps">
            <li>
              <strong>Export</strong> a GLB (or the OBJ zip) from this dialog.
            </li>
            <li>
              <strong>Prepare the mesh</strong> in Blender or similar: join the parts into one mesh, UV-unwrap it and bake the colours into a single texture of 1024×1024 or smaller. Roblox accessories use one mesh and one texture.
            </li>
            <li>
              <strong>Import into Roblox Studio</strong> with the 3D Importer, then check the size against a Roblox avatar. The accessory faces −Z, like Roblox characters.
            </li>
            <li>
              <strong>Fit it</strong> using Studio's avatar and accessory tools, and set the attachment for its slot (for example the hat attachment on the head).
            </li>
            <li>
              <strong>Upload</strong> through the Creator Hub. Roblox runs its own validation and moderation, and UGC uploading has eligibility requirements.
            </li>
          </ol>
          <p className="hint">
            Roblox changes these requirements from time to time. Check the current rules in the{' '}
            <a href="https://create.roblox.com/docs" target="_blank" rel="noreferrer">
              Creator Docs <ExternalLink size={11} style={{ verticalAlign: '-1px' }} />
            </a>
            .
          </p>
        </div>
      </div>
    </Modal>
  );
}
