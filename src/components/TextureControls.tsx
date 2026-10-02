import { memo } from 'react';
import { ImagePlus, RefreshCw, X } from 'lucide-react';
import { pickFiles, textureFromFile, uploadTexture } from '../editor/importers';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { NumberField, SliderField } from './ui/Fields';

export const TextureControls = memo(function TextureControls({ id }: { id: string }) {
  const m = useEditor((s) => s.objects[id]?.material);
  const textures = useEditor((s) => s.textures);
  const locked = useEditor((s) => s.objects[id]?.locked ?? false);
  const setMaterial = useEditor((s) => s.setMaterial);
  const replaceTexture = useEditor((s) => s.replaceTexture);
  if (!m) return null;
  const tex = textures.find((t) => t.id === m.textureId);
  const set = (patch: Partial<typeof m>, field: string) => setMaterial(id, patch, `${id}:tex:${field}`);

  return (
    <div className="col" style={{ gap: 7 }}>
      {tex ? (
        <div className="tex-current">
          <span className="tex-thumb" style={{ backgroundImage: `url(${tex.dataUrl})` }} />
          <div className="grow">
            <div className="truncate" title={tex.name}>
              {tex.name}
            </div>
            <div className="hint num">
              {tex.width}×{tex.height} px
            </div>
          </div>
          <button
            className="icon-btn sm"
            title="Replace image"
            aria-label="Replace image"
            disabled={locked}
            onClick={async () => {
              const [f] = await pickFiles('image/png,image/jpeg,image/webp');
              if (!f) return;
              try {
                const t = await textureFromFile(f);
                replaceTexture(tex.id, { dataUrl: t.dataUrl, width: t.width, height: t.height, name: t.name });
                useUI.getState().toast('success', `Replaced texture with "${t.name}"`);
              } catch (e) {
                useUI.getState().toast('error', e instanceof Error ? e.message : 'Could not replace the texture.');
              }
            }}
          >
            <RefreshCw size={13} />
          </button>
          <button className="icon-btn sm" title="Remove from part" aria-label="Remove texture from part" disabled={locked} onClick={() => set({ textureId: null }, 'remove')}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="hint">No texture on this part.</div>
      )}

      <div className="row">
        <select
          className="select"
          aria-label="Texture from library"
          value={m.textureId ?? ''}
          disabled={locked}
          onChange={(e) => set(e.target.value ? { textureId: e.target.value, color: '#ffffff' } : { textureId: null }, 'pick')}
        >
          <option value="">{textures.length ? 'Choose from library…' : 'Library is empty'}</option>
          {textures.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="btn sm"
          disabled={locked}
          onClick={async () => {
            const [f] = await pickFiles('image/png,image/jpeg,image/webp');
            if (f) await uploadTexture(f, true);
          }}
        >
          <ImagePlus size={13} /> Upload
        </button>
      </div>

      {tex && (
        <>
          <div>
            <div className="prop-label">Scale (tiling)</div>
            <div className="vec3" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <NumberField label="U" value={m.texRepeat[0]} step={0.25} min={0.05} max={64} disabled={locked} onChange={(v) => set({ texRepeat: [v, m.texRepeat[1]] }, 'repeat')} />
              <NumberField label="V" value={m.texRepeat[1]} step={0.25} min={0.05} max={64} disabled={locked} onChange={(v) => set({ texRepeat: [m.texRepeat[0], v] }, 'repeat')} />
            </div>
          </div>
          <div>
            <div className="prop-label">Offset</div>
            <div className="vec3" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <NumberField label="U" value={m.texOffset[0]} step={0.05} disabled={locked} onChange={(v) => set({ texOffset: [v, m.texOffset[1]] }, 'offset')} />
              <NumberField label="V" value={m.texOffset[1]} step={0.05} disabled={locked} onChange={(v) => set({ texOffset: [m.texOffset[0], v] }, 'offset')} />
            </div>
          </div>
          <SliderField label="Rotation" value={m.texRotation} min={-180} max={180} step={1} precision={0} disabled={locked} onChange={(v) => set({ texRotation: v }, 'rotation')} />
          <p className="hint">Tiling, offset and rotation preview live. GLB/glTF exports keep them (KHR_texture_transform); OBJ exports keep the mesh UVs as they are.</p>
        </>
      )}
    </div>
  );
});
