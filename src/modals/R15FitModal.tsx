import { useState } from 'react';
import JSZip from 'jszip';
import { Download, FlaskConical } from 'lucide-react';
import { Modal } from '../components/ui/Overlays';
import { canvasToBlob } from '../clothing/composite';
import { R15_DEFAULTS } from '../clothing/mapping';
import { r15TestPattern } from '../clothing/presets';
import { drawLayers } from '../clothing/render';
import { TEMPLATES } from '../clothing/templates';
import { SliderField } from '../components/ui/Fields';
import { useClothing } from '../store/clothing';
import { useUI } from '../store/ui';
import { downloadBlob } from '../utils/download';

export function R15FitModal() {
  const close = useUI((s) => s.closeModal);
  const toast = useUI((s) => s.toast);
  const cal = useClothing((s) => s.r15Cal);
  const setCal = useClothing((s) => s.setR15Cal);
  const insert = useClothing((s) => s.insertLayers);
  const kind = useClothing((s) => s.activeKind);
  const [busy, setBusy] = useState(false);
  const hand = 128 - cal.limbUpper - cal.limbLower;
  const band = (px: number) => `${px} px (between band ${Math.floor((px - 1) / 16)} and ${Math.floor(px / 16)})`;
  const changed = cal.torsoLower !== R15_DEFAULTS.torsoLower || cal.limbUpper !== R15_DEFAULTS.limbUpper || cal.limbLower !== R15_DEFAULTS.limbLower;

  const download = async () => {
    setBusy(true);
    try {
      const zip = new JSZip();
      for (const k of ['shirt', 'pants'] as const) {
        const spec = TEMPLATES[k];
        const c = document.createElement('canvas');
        c.width = spec.width;
        c.height = spec.height;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('This browser cannot draw the test pattern.');
        drawLayers(ctx, k, r15TestPattern(k), { getImage: () => null, version: 0 }, 1);
        zip.file(`r15-test-${k}.png`, await canvasToBlob(c));
      }
      zip.file('README.txt', 'R15 test pattern from Nexo UGC Studio.\nUpload as a Shirt and Pants, wear them on an R15 avatar and read which numbered 16 px band sits at each joint.\n');
      downloadBlob(await zip.generateAsync({ type: 'blob' }), 'nexo-r15-test-pattern.zip');
      toast('success', 'Downloaded the test shirt and pants');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not build the test pattern.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="R15 fit calibration"
      size="wide"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={() => setCal('reset')} disabled={!changed}>
            Reset to defaults
          </button>
          <div className="grow" />
          <button className="btn primary" onClick={close}>
            Done
          </button>
        </>
      }
    >
      <div className="export-grid">
        <div className="col" style={{ gap: 12 }}>
          <p className="dim">
            On R15 avatars Roblox splits each sleeve, leg and the torso across several body segments. This tool previews that split using Roblox's published limb guidance (<strong>64 px upper, 48 px lower, rest for the hand or foot</strong>), but the torso line is an estimate, and the real result can only be confirmed on a real avatar. Use the test pattern to check, then adjust here so the preview matches what you see in Roblox.
          </p>
          <SliderField label="Lower torso" value={cal.torsoLower * 100} min={5} max={45} step={1} precision={0} onChange={(v) => setCal({ torsoLower: v / 100 })} labelWidth={96} />
          <SliderField label="Upper arm/leg" value={cal.limbUpper} min={40} max={90} step={1} precision={0} onChange={(v) => setCal({ limbUpper: v })} labelWidth={96} />
          <SliderField label="Lower arm/leg" value={cal.limbLower} min={24} max={72} step={1} precision={0} onChange={(v) => setCal({ limbLower: v })} labelWidth={96} />
          <div className="export-summary" style={{ flexDirection: 'column', gap: 4 }}>
            <div>
              <span className="dim">Shoulder to elbow:</span> top 0 to {band(cal.limbUpper)}
            </div>
            <div>
              <span className="dim">Elbow to wrist:</span> {cal.limbUpper} to {band(cal.limbUpper + cal.limbLower)}
            </div>
            <div>
              <span className="dim">Hand or foot:</span> {hand} px
            </div>
            <div>
              <span className="dim">Waist (torso split) at:</span> {Math.round(128 * (1 - cal.torsoLower))} px of 128 on the torso panels
            </div>
          </div>
          <p className="hint">Changes apply to this project's preview and the purple joint lines on the template. Exported PNGs never change.</p>
        </div>
        <div className="col roblox" style={{ gap: 12 }}>
          <h3 className="panel-title">Test it on a real R15 avatar</h3>
          <ol className="steps">
            <li>
              <button className="btn sm" onClick={download} disabled={busy}>
                <Download size={13} /> Download test shirt and pants
              </button>{' '}
              Each side panel is cut into numbered 16 px bands (0 at the top).
            </li>
            <li>Upload them in the Creator Hub as a Shirt and Pants. Uploading may cost Robux and goes through moderation, so use a test account if you can.</li>
            <li>Wear them on an R15 avatar. Look at the elbow, wrist, knee, ankle and waist, and note which band number sits at each joint.</li>
            <li>Move the sliders until the bands at the same joints in this preview match what you saw. The pattern is also available as a preset ("R15 test pattern") if you want to view it on the 3D model first.</li>
            <li>
              Also check the torso <strong>top and bottom</strong> panels: the yellow "front edge" text should sit on the front side. If it is on the back, tell me and I will flip that mapping.
            </li>
          </ol>
          <button
            className="btn"
            style={{ alignSelf: 'flex-start' }}
            disabled={kind === 'tshirt'}
            onClick={() => {
              insert(r15TestPattern(kind === 'pants' ? 'pants' : 'shirt'), false);
              toast('info', 'Test pattern added on top of the current design. Undo with Ctrl+Z to remove it.');
              close();
            }}
          >
            <FlaskConical size={14} /> Preview the pattern on the model
          </button>
        </div>
      </div>
    </Modal>
  );
}
