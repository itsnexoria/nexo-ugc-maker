import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle } from 'lucide-react';
import { useValidation } from '../hooks/useValidation';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { LIMITS, type Severity } from '../utils/validation';

const ICON: Record<Severity, JSX.Element> = {
  ok: <CheckCircle2 size={15} color="var(--ok)" />,
  info: <Info size={15} color="var(--info)" />,
  warn: <AlertTriangle size={15} color="var(--warn)" />,
  error: <XCircle size={15} color="var(--err)" />,
};

export function ValidationPanel() {
  const report = useValidation();
  const select = useEditor((s) => s.select);
  const optimize = useEditor((s) => s.optimizeTriangles);
  const status = report.errors ? 'err' : report.warnings ? 'warn' : 'ok';
  const headline = report.errors
    ? `${report.errors} problem${report.errors === 1 ? '' : 's'} to fix`
    : report.warnings
      ? `${report.warnings} warning${report.warnings === 1 ? '' : 's'}`
      : 'Ready to export';

  return (
    <div className="validation">
      <div className={`val-summary ${status}`}>
        <span className={`status-dot ${status}`} />
        <strong className="grow">{headline}</strong>
        <span className="hint row" style={{ gap: 4 }}>
          <RefreshCw size={11} /> Live
        </span>
      </div>
      <div className="val-stats">
        <div>
          <span className="dim">Triangles</span>
          <span className="num">
            {report.triangles.toLocaleString()} / {LIMITS.maxTriangles.toLocaleString()}
          </span>
          <div className="meter">
            <div className={`meter-fill ${report.triangles > LIMITS.maxTriangles ? 'err' : report.triangles > LIMITS.warnTriangles ? 'warn' : 'ok'}`} style={{ width: `${Math.min(100, (report.triangles / LIMITS.maxTriangles) * 100)}%` }} />
          </div>
        </div>
        <div>
          <span className="dim">Size (studs)</span>
          <span className="num">{report.size ? report.size.map((n) => Math.round(n * 100) / 100).join(' × ') : '—'}</span>
        </div>
      </div>
      {report.triangles > LIMITS.warnTriangles && (
        <div style={{ padding: '0 12px 10px' }}>
          <button
            className="btn sm"
            onClick={() => {
              const r = optimize(Math.floor(LIMITS.maxTriangles * 0.85));
              if (!r.changed) useUI.getState().toast('warn', 'Nothing left to reduce automatically. Remove parts or merge shapes by hand.');
              else if (r.after > LIMITS.maxTriangles) useUI.getState().toast('warn', `Reduced triangles from ${r.before.toLocaleString()} to ${r.after.toLocaleString()}, but that is still over ${LIMITS.maxTriangles.toLocaleString()}. Remove or merge some parts by hand.`, { label: 'Undo', onClick: () => useEditor.getState().undo() });
              else useUI.getState().toast('success', `Reduced triangles from ${r.before.toLocaleString()} to ${r.after.toLocaleString()} (${r.changed} part${r.changed === 1 ? '' : 's'} set to low-poly)`, { label: 'Undo', onClick: () => useEditor.getState().undo() });
            }}
          >
            Reduce triangles automatically
          </button>
          <p className="hint" style={{ marginTop: 4 }}>Switches the heaviest shapes to low-poly until the total fits under {Math.floor(LIMITS.maxTriangles * 0.85).toLocaleString()}. One undo step.</p>
        </div>
      )}
      <ul className="val-list">
        {report.results.map((r) => (
          <li key={r.id}>
            <button className={`val-row ${r.objectIds?.length ? 'clickable' : ''}`} onClick={() => r.objectIds?.[0] && select(r.objectIds[0])} disabled={!r.objectIds?.length}>
              <span className="val-icon">{ICON[r.severity]}</span>
              <span className="val-text">
                <span className="val-title">{r.title}</span>
                {r.detail && <span className="val-detail">{r.detail}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint" style={{ padding: '0 12px 12px' }}>
        Triangle and texture limits follow Roblox's published rules for rigid accessories (4,000 triangles, 1024×1024 textures). Roblox updates its specs, so confirm the current numbers on create.roblox.com before uploading. Size warnings are Studio guidelines, not Roblox rules.
      </p>
    </div>
  );
}
