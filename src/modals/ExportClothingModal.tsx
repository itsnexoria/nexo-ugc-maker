import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { AlertTriangle, CheckCircle2, ExternalLink, Info, XCircle } from 'lucide-react';
import { Modal } from '../components/ui/Overlays';
import { canvasToBlob, exportCanvas, renderFull } from '../clothing/composite';
import { exportLayeredGlb, type LayeredStats } from '../clothing/layered';
import { buildFromTemplate, exportTemplateBuild, parseTemplate, uvLayoutGuide, type TemplateBuild, type TemplateInfo } from '../clothing/layeredTemplate';
import { pickFiles } from '../editor/importers';
import { KIND_ORDER, TEMPLATES } from '../clothing/templates';
import { checkCoverage, checkLayers, coverage, type ClothingSeverity } from '../clothing/validation';
import { useClothing } from '../store/clothing';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { downloadBlob, safeFilename } from '../utils/download';
import { clothingReadme, formatBytes, type ClothingReadmeItem } from '../utils/bundle';
import type { ClothingKind } from '../types';

const ICON: Record<ClothingSeverity, JSX.Element> = {
  ok: <CheckCircle2 size={14} color="var(--ok)" />,
  info: <Info size={14} color="var(--info)" />,
  warn: <AlertTriangle size={14} color="var(--warn)" />,
  error: <XCircle size={14} color="var(--err)" />,
};

function SliderRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="slider-row" style={{ gridTemplateColumns: '72px 1fr 52px' }}>
      <span className="slider-label">{label}</span>
      <input type="range" min={0.04} max={0.4} step={0.01} value={value} aria-label={label} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="num dim">{value.toFixed(2)}</span>
    </div>
  );
}

const UPLOAD_AS: Record<ClothingKind, string> = { shirt: 'Shirt', pants: 'Pants', tshirt: 'T-Shirt' };

export function ExportClothingModal() {
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const designs = useClothing((s) => s.designs);
  const images = useClothing((s) => s.images);
  const startKind = useClothing((s) => s.activeKind);
  const projectName = useEditor((s) => s.project.name);
  const [kind, setKind] = useState<ClothingKind>(startKind);
  const [tSize, setTSize] = useState(128);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  /** the file that would actually be downloaded: decoded back from the PNG, so what you see is what you get */
  const [finalFile, setFinalFile] = useState<{ width: number; height: number; bytes: number } | null>(null);
  const [cover, setCover] = useState(0);
  const [puff, setPuff] = useState(0.12);
  const [tpl, setTpl] = useState<TemplateInfo | null>(null);
  const [tplBase, setTplBase] = useState<number | undefined>(undefined);
  const [frontPlusZ, setFrontPlusZ] = useState(false);
  const [tplBuild, setTplBuild] = useState<TemplateBuild | null>(null);
  const [layeredInfo, setLayeredInfo] = useState<(LayeredStats & { names: string[] }) | null>(null);

  const spec = TEMPLATES[kind];
  const outSize = kind === 'tshirt' ? tSize : null;
  const wantW = outSize ?? spec.width;
  const wantH = outSize ?? spec.height;
  const checks = useMemo(() => {
    const list = checkLayers(kind, designs[kind], images);
    if (designs[kind].some((l) => l.visible)) list.push(checkCoverage(kind, cover));
    if (finalFile) {
      const exact = finalFile.width === wantW && finalFile.height === wantH;
      list.push(
        exact
          ? { id: 'final-size', severity: 'ok', title: `Exports at exactly ${wantW} × ${wantH}`, detail: `${formatBytes(finalFile.bytes)} PNG` }
          : { id: 'final-size', severity: 'error', title: `The PNG came out ${finalFile.width} × ${finalFile.height}`, detail: `Roblox expects ${wantW} × ${wantH}` },
      );
    }
    return list;
  }, [kind, designs, images, cover, finalFile, wantW, wantH]);
  const blocking = checks.some((c) => c.severity === 'error');

  useEffect(() => {
    const c = renderFull(kind);
    setCover(coverage(kind, c));
  }, [kind, designs]);

  // preview the real exported PNG (right size, real transparency), not just the working canvas
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    void (async () => {
      try {
        const blob = await canvasToBlob(exportCanvas(kind, outSize ?? undefined));
        const bmp = await createImageBitmap(blob);
        const info = { width: bmp.width, height: bmp.height, bytes: blob.size };
        bmp.close();
        if (!live) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
        setFinalFile(info);
      } catch {
        if (live) setFinalFile(null);
      }
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [kind, designs, outSize]);

  const fileFor = (k: ClothingKind) => `${safeFilename(projectName)}-${k === 'tshirt' ? 't-shirt' : k}.png`;

  const download = async () => {
    setBusy(true);
    try {
      const blob = await canvasToBlob(exportCanvas(kind, outSize ?? undefined));
      downloadBlob(blob, fileFor(kind));
      toast('success', `Exported ${fileFor(kind)} (${outSize ?? spec.width}×${outSize ?? spec.height})`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadAll = async () => {
    setBusy(true);
    try {
      const zip = new JSZip();
      const items: ClothingReadmeItem[] = [];
      for (const k of KIND_ORDER) {
        if (!designs[k].some((l) => l.visible)) continue;
        const size = k === 'tshirt' ? tSize : undefined;
        const canvas = exportCanvas(k, size);
        const blob = await canvasToBlob(canvas);
        const frac = coverage(k, renderFull(k));
        const kChecks = checkLayers(k, designs[k], images);
        kChecks.push(checkCoverage(k, frac));
        const bmp = await createImageBitmap(blob);
        const want = TEMPLATES[k];
        const exact = bmp.width === (size ?? want.width) && bmp.height === (size ?? want.height);
        kChecks.push(exact ? { id: 'final-size', severity: 'ok', title: `Exports at exactly ${bmp.width} × ${bmp.height}` } : { id: 'final-size', severity: 'error', title: `The PNG came out ${bmp.width} × ${bmp.height}`, detail: `Roblox expects ${size ?? want.width} × ${size ?? want.height}` });
        items.push({ kind: k, file: fileFor(k), width: bmp.width, height: bmp.height, bytes: blob.size, coverage: frac, checks: kChecks.map((c) => ({ severity: c.severity, title: c.title, detail: c.detail })) });
        bmp.close();
        zip.file(fileFor(k), blob);
      }
      if (!items.length) throw new Error('Every design is empty. Add some artwork first.');
      zip.file('README.md', clothingReadme({ name: projectName, items, appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev', date: new Date().toISOString().slice(0, 10) }));
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `${safeFilename(projectName)}-clothing.zip`);
      toast('success', `Exported ${items.length} file${items.length === 1 ? '' : 's'} with a README checklist`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadLayered = async () => {
    setBusy(true);
    try {
      const itemName = safeFilename(projectName).replace(/-/g, '_') + (kind === 'pants' ? '_Pants' : '_Jacket');
      const r = await exportLayeredGlb(kind, itemName, puff);
      downloadBlob(r.blob, `${itemName}-layered-starter.glb`);
      setLayeredInfo({ ...r.stats, names: [r.names.mesh, r.names.inner, r.names.outer] });
      toast('success', `Exported the layered starter (${r.stats.triangles.toLocaleString()} triangles, ${r.stats.bones} bones). It still needs Roblox's cage templates.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Layered export failed.');
    } finally {
      setBusy(false);
    }
  };

  const loadTemplate = async () => {
    const [f] = await pickFiles('.fbx,.glb,.gltf');
    if (!f) return;
    setBusy(true);
    try {
      const info = await parseTemplate(f.name, await f.arrayBuffer());
      setTpl(info);
      setTplBuild(null);
      setTplBase(undefined);
      toast('success', `Read ${f.name}: ${info.meshes.length} mesh${info.meshes.length === 1 ? '' : 'es'}, ${info.bones} bones`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not read the template file.');
    } finally {
      setBusy(false);
    }
  };

  const buildTemplate = async (download: boolean) => {
    if (!tpl || kind === 'tshirt') return;
    setBusy(true);
    try {
      const itemName = safeFilename(projectName).replace(/-/g, '_') + (kind === 'pants' ? '_Pants' : '_Jacket');
      const b = buildFromTemplate(tpl, { kind, name: itemName, puffiness: puff, frontPositiveZ: frontPlusZ, baseIndex: tplBase });
      setTplBuild(b);
      if (download) {
        downloadBlob(await exportTemplateBuild(b), `${itemName}-layered-from-template.glb`);
        toast('success', `Exported ${b.stats.triangles.toLocaleString()} triangles with the template's own vertices, UVs and skin weights`);
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not build from the template.');
    } finally {
      setBusy(false);
    }
  };

  const downloadUvLayout = () => {
    if (!tpl) return;
    try {
      const mesh = tpl.meshes[tplBase ?? Math.max(0, tpl.meshes.findIndex((m) => m.role === 'inner'))]?.mesh;
      const c = mesh ? uvLayoutGuide(mesh.geometry as import('three').BufferGeometry) : null;
      if (!c) throw new Error('This mesh has no UVs to draw.');
      c.toBlob((b) => b && downloadBlob(b, 'cage-uv-layout.png'), 'image/png');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not draw the UV layout.');
    }
  };

  return (
    <Modal
      title="Export clothing"
      size="wide"
      onClose={close}
      footer={
        <>
          <span className="hint grow">{blocking ? 'Fix the errors, or export anyway to inspect the file.' : 'Ready to export.'}</span>
          <button className="btn" onClick={downloadAll} disabled={busy}>
            Upload bundle (ZIP)
          </button>
          <button className="btn primary" onClick={download} disabled={busy}>
            {busy ? 'Exporting…' : `Download ${spec.label} PNG`}
          </button>
        </>
      }
    >
      <div className="export-grid">
        <div className="col" style={{ gap: 12 }}>
          <div className="seg" role="tablist" aria-label="Item to export" style={{ alignSelf: 'flex-start' }}>
            {KIND_ORDER.map((k) => (
              <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {TEMPLATES[k].label}
              </button>
            ))}
          </div>
          <div className="export-preview checker" style={{ aspectRatio: `${spec.width} / ${spec.height}` }}>
            {preview && <img src={preview} alt={`${spec.label} template preview`} />}
          </div>
          <div className="export-summary">
            <div>
              <span className="dim">Format</span> <span>PNG, transparent</span>
            </div>
            <div>
              <span className="dim">Size</span>{' '}
              <span className="num">
                {wantW} × {wantH}
              </span>
              {kind !== 'tshirt' || tSize === 128 ? <span className="dim"> (Roblox template size)</span> : null}
            </div>
            <div>
              <span className="dim">File</span> <span className="num">{finalFile ? formatBytes(finalFile.bytes) : '…'}</span>
            </div>
          </div>
          {kind === 'tshirt' && (
            <div className="field">
              <label htmlFor="ts-size">T-shirt image size</label>
              <select id="ts-size" className="select" value={tSize} onChange={(e) => setTSize(parseInt(e.target.value, 10))}>
                <option value={128}>128 × 128 (matches Roblox's template)</option>
                <option value={256}>256 × 256</option>
                <option value={512}>512 × 512</option>
              </select>
              <span className="hint">The design is drawn at 4× and scaled down cleanly, so 128 stays sharp.</span>
            </div>
          )}
          <ul className="issue-list" aria-label="Checks">
            {checks.map((c) => (
              <li key={c.id}>
                {ICON[c.severity]}
                <span>
                  <strong>{c.title}</strong>
                  {c.detail ? `. ${c.detail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="col roblox" style={{ gap: 12 }}>
          <h3 className="panel-title">Getting it onto Roblox</h3>
          <p className="dim">
            This exports the flat template image Roblox expects for <strong>Classic {UPLOAD_AS[kind]}</strong>. Nothing is uploaded from here. Layered (3D) clothing is a different thing and is covered in the starter section below.
          </p>
          <ol className="steps">
            <li>
              <strong>Download</strong> the PNG for this item. Shirts and pants are exactly {TEMPLATES.shirt.width} × {TEMPLATES.shirt.height}.
            </li>
            <li>
              <strong>Test it</strong> on an avatar before uploading (an R6 and an R15 if you can). Roblox places R15 clothing slightly differently from this preview.
            </li>
            <li>
              <strong>Upload</strong> in the Creator Hub and choose the matching type: <strong>{UPLOAD_AS[kind]}</strong>, not another clothing type.
            </li>
            <li>
              <strong>Wait for moderation.</strong> Roblox reviews every upload. Uploading and selling may have fees or eligibility rules, so check the current ones.
            </li>
          </ol>
          {kind !== 'tshirt' && (
            <div className="layered-box">
              <div className="row" style={{ gap: 8 }}>
                <h3 className="panel-title grow">Layered clothing starter (beta)</h3>
                <span className="beta-tag">Not upload-ready</span>
              </div>
              <p className="dim">
                Layered clothing is a 3D mesh, not a flat image. This exports a <strong>starting point</strong>: a garment mesh skinned to an R15 skeleton, with <code>_InnerCage</code> and <code>_OuterCage</code> placeholder meshes, textured with your current {TEMPLATES[kind].label.toLowerCase()} design.
              </p>
              <div className="warn-box">
                <AlertTriangle size={14} color="var(--warn)" />
                <span>
                  Roblox requires cage vertices and UVs to <strong>match its own template cages</strong>, and this studio cannot reproduce those. Our cages are placeholders. You must replace them with the cages from Roblox's layered clothing template (Blender or Maya) and fit the mesh to Roblox's R15 body, which differs slightly from this mannequin.
                </span>
              </div>
              <div className="tpl-box">
                <strong>Best: build from Roblox's own cage template</strong>
                <p className="dim">
                  Roblox requires your cages to keep the template's vertices and UVs, so the reliable way is to start from its file. Download <code>Clothing_Cage_Template.fbx</code> (or <code>ClassicMannequin_With-Cages.fbx</code>) from Roblox's layered clothing project files, then load it here. The file stays on your device. This path has not been tested against Roblox's real files yet.
                </p>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <button className="btn sm" onClick={loadTemplate} disabled={busy}>
                    {tpl ? 'Load a different template…' : 'Load Roblox cage template…'}
                  </button>
                  <a className="hint" href="https://create.roblox.com/docs/avatar/layered-accessories/project-files" target="_blank" rel="noreferrer">
                    Where to download it <ExternalLink size={11} style={{ verticalAlign: '-1px' }} />
                  </a>
                </div>
                {tpl && (
                  <>
                    <table className="grid-table plain" aria-label="Meshes in the template">
                      <thead>
                        <tr>
                          <th>Use as base</th>
                          <th>Mesh</th>
                          <th>Found as</th>
                          <th className="r">Tris</th>
                          <th>Skin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tpl.meshes.map((m, i) => (
                          <tr key={`${m.name}${i}`}>
                            <td>
                              <input type="radio" name="tpl-base" aria-label={`Use ${m.name} as the base cage`} checked={(tplBase ?? tpl.meshes.findIndex((x) => x.role === 'inner')) === i} onChange={() => setTplBase(i)} />
                            </td>
                            <td className="truncate" title={m.name}>
                              {m.name}
                            </td>
                            <td className="dim">{m.role === 'inner' ? 'inner cage' : m.role === 'outer' ? 'outer cage' : m.role === 'other' ? 'cage' : 'body'}</td>
                            <td className="num r">{m.triangles.toLocaleString()}</td>
                            <td>{m.skinned ? 'yes' : 'no'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="row">
                      <label className="dim" htmlFor="tpl-front" style={{ width: 120 }}>
                        Template faces
                      </label>
                      <select id="tpl-front" className="select" value={frontPlusZ ? '+z' : '-z'} onChange={(e) => setFrontPlusZ(e.target.value === '+z')}>
                        <option value="-z">−Z (Roblox convention)</option>
                        <option value="+z">+Z (flip if the design lands backwards)</option>
                      </select>
                    </div>
                    <div className="row" style={{ flexWrap: 'wrap' }}>
                      <button className="btn sm primary" onClick={() => buildTemplate(true)} disabled={busy}>
                        Build and download (GLB)
                      </button>
                      <button className="btn sm" onClick={downloadUvLayout} disabled={busy}>
                        Download UV layout (PNG)
                      </button>
                    </div>
                    {tplBuild && (
                      <ul className="issue-list" aria-label="Template build details">
                        <li>
                          <CheckCircle2 size={14} color="var(--ok)" />
                          <span>
                            <strong>{tplBuild.stats.triangles.toLocaleString()}</strong> triangles, {tplBuild.stats.bones} bones, {tplBuild.stats.textured ? 'your design baked onto the cage UVs' : 'plain material'}.
                          </span>
                        </li>
                        {tplBuild.warnings.map((w) => (
                          <li key={w}>
                            <AlertTriangle size={14} color="var(--warn)" />
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
              <strong style={{ marginTop: 4 }}>Or: a generic starter (no template needed)</strong>
              <SliderRow label="Puffiness" value={puff} onChange={setPuff} />
              <div className="row">
                <button className="btn" onClick={downloadLayered} disabled={busy}>
                  Download layered starter (GLB)
                </button>
                <span className="hint">Also shown live in the 3D preview with the Puffiness slider.</span>
              </div>
              {layeredInfo && (
                <ul className="issue-list" aria-label="Layered export details">
                  <li>
                    <CheckCircle2 size={14} color="var(--ok)" />
                    <span>
                      <strong>{layeredInfo.triangles.toLocaleString()}</strong> triangles, <strong>{layeredInfo.bones}</strong> bones, at most <strong>{layeredInfo.maxInfluences}</strong> skin influences per vertex (Roblox allows 4).
                    </span>
                  </li>
                  <li>
                    <Info size={14} color="var(--info)" />
                    <span>
                      Meshes named <code>{layeredInfo.names[0]}</code>, <code>{layeredInfo.names[1]}</code>, <code>{layeredInfo.names[2]}</code>, following Roblox's cage naming rule.
                    </span>
                  </li>
                </ul>
              )}
              <ol className="steps">
                <li>Download Roblox's layered clothing template (R15 rig and cages) from the Creator Docs.</li>
                <li>Import our GLB into Blender. Fit the garment to the template body, then copy the template's inner and outer cages onto the two cage meshes, keeping their vertices and UVs untouched.</li>
                <li>Check that the outer cage fully covers the garment, and that the mesh is skinned to the standard R15 skeleton.</li>
                <li>Export with Roblox's layered export settings, import in Studio, and use the validation tools before uploading.</li>
              </ol>
              <p className="hint">
                Bone names follow R15 part names and the root is <code>HumanoidRootPart</code>. Compare them with Roblox's R15 rig template, which is the authority.{' '}
                <a href="https://create.roblox.com/docs/avatar/layered-accessories/specifications" target="_blank" rel="noreferrer">
                  Layered accessory specifications <ExternalLink size={11} style={{ verticalAlign: '-1px' }} />
                </a>
              </p>
            </div>
          )}
          <p className="hint">
            Roblox's template sizes and rules can change. See the{' '}
            <a href="https://create.roblox.com/docs" target="_blank" rel="noreferrer">
              Creator Docs <ExternalLink size={11} style={{ verticalAlign: '-1px' }} />
            </a>
            . Only upload artwork you have the right to use.
          </p>
        </div>
      </div>
    </Modal>
  );
}
