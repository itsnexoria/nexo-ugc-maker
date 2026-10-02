import { Backpack, Bird, Disc, Glasses, Gem, HardHat, Scissors, Trash2, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { ASSETS, CATEGORY_LABELS } from '../assets/presets';
import { MATERIAL_PRESETS } from '../assets/materials';
import { BUILTIN_TEXTURES } from '../assets/textures';
import { SLOT_LABELS } from '../assets/avatar';
import { builtinThumb, addBuiltinTexture, applyMaterialPresetToSelection } from '../editor/library';
import { importModelFile, pickFiles, uploadTexture } from '../editor/importers';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useUserAssets } from '../store/userAssets';
import type { AssetCategory, PartSpec, SlotId } from '../types';
import { MaterialSwatch } from './MaterialSwatch';

const SLOT_ICON: Record<SlotId, ReactNode> = {
  hat: <HardHat size={18} />,
  hair: <Scissors size={18} />,
  face: <Glasses size={18} />,
  shoulder: <Bird size={18} />,
  back: <Backpack size={18} />,
  waist: <Disc size={18} />,
  accessory: <Gem size={18} />,
};

function countParts(spec: PartSpec): number {
  return (spec.children ?? []).reduce((n, c) => n + countParts(c), spec.kind === 'group' ? 0 : 1);
}

interface Props {
  category: AssetCategory;
  onPicked?: () => void;
  compact?: boolean;
}

export function AssetGrid({ category, onPicked, compact }: Props) {
  const addAccessory = useEditor((s) => s.addAccessory);
  const userAssets = useUserAssets((s) => s.assets);
  const removeUser = useUserAssets((s) => s.remove);
  const toast = useUI((s) => s.toast);

  if (category === 'materials') {
    return (
      <div className={`asset-grid ${compact ? 'compact' : ''}`}>
        {MATERIAL_PRESETS.map((p) => (
          <button
            key={p.id}
            className="asset-card"
            onClick={() => {
              applyMaterialPresetToSelection(p.id);
              onPicked?.();
            }}
          >
            <MaterialSwatch preset={p} />
            <span className="asset-name">{p.name}</span>
            <span className="asset-desc">{p.note}</span>
          </button>
        ))}
        <p className="hint asset-foot">Applies to the selected part.</p>
      </div>
    );
  }

  if (category === 'textures') {
    return (
      <div className={`asset-grid ${compact ? 'compact' : ''}`}>
        {BUILTIN_TEXTURES.map((t) => {
          const thumb = builtinThumb(t.id);
          return (
            <button
              key={t.id}
              className="asset-card"
              onClick={() => {
                addBuiltinTexture(t.id, true);
                onPicked?.();
              }}
            >
              <span className="asset-thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} />
              <span className="asset-name">{t.name}</span>
              <span className="asset-desc">
                {t.size}×{t.size}, tileable
              </span>
            </button>
          );
        })}
        <button
          className="asset-card add"
          onClick={async () => {
            const [f] = await pickFiles('image/png,image/jpeg,image/webp');
            if (f) {
              await uploadTexture(f);
              onPicked?.();
            }
          }}
        >
          <Upload size={20} />
          <span className="asset-name">Upload your own</span>
          <span className="asset-desc">PNG, JPG or WebP</span>
        </button>
      </div>
    );
  }

  const builtin = ASSETS.filter((a) => a.category === category);
  const mine = userAssets.filter((a) => a.category === category);

  return (
    <div className={`asset-grid ${compact ? 'compact' : ''}`}>
      {builtin.map((a) => (
        <button
          key={a.id}
          className="asset-card"
          onClick={() => {
            addAccessory(a.build(), a.slot);
            toast('success', `Added ${a.name} on the ${SLOT_LABELS[a.slot].toLowerCase()} slot`);
            onPicked?.();
          }}
        >
          <span className="asset-icon">{SLOT_ICON[a.slot]}</span>
          <span className="asset-name">{a.name}</span>
          <span className="asset-desc">{a.description}</span>
          <span className="asset-meta">{countParts(a.build())} parts</span>
        </button>
      ))}
      {mine.map((a) => (
        <div key={a.id} className="asset-card user" role="button" tabIndex={0}
          onClick={() => {
            addAccessory(a.spec, a.slot);
            toast('success', `Added ${a.name}`);
            onPicked?.();
          }}
          onKeyDown={(e) => e.key === 'Enter' && (addAccessory(a.spec, a.slot), onPicked?.())}
        >
          <span className="asset-icon">{SLOT_ICON[a.slot]}</span>
          <span className="asset-name">{a.name}</span>
          <span className="asset-desc">Your asset</span>
          <span className="asset-meta">{countParts(a.spec)} parts</span>
          <button
            className="icon-btn sm asset-del"
            aria-label={`Delete ${a.name}`}
            onClick={(e) => {
              e.stopPropagation();
              removeUser(a.id);
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      {builtin.length + mine.length === 0 && (
        <div className="empty">
          <strong>No {CATEGORY_LABELS[category].toLowerCase()} yet</strong>
          <span>Build something, select it, then use “Save as asset”.</span>
        </div>
      )}
    </div>
  );
}

export function ImportModelButton({ onDone }: { onDone?: () => void }) {
  return (
    <button
      className="btn"
      onClick={async () => {
        const [f] = await pickFiles('.obj,.glb,.gltf');
        if (f && (await importModelFile(f))) onDone?.();
      }}
    >
      <Upload size={14} /> Import model
    </button>
  );
}

