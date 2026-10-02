import { useMemo } from 'react';
import { useEditor } from '../store/editor';
import { validateProject } from '../utils/validation';

export function useValidation() {
  const objects = useEditor((s) => s.objects);
  const order = useEditor((s) => s.order);
  const layers = useEditor((s) => s.layers);
  const textures = useEditor((s) => s.textures);
  const models = useEditor((s) => s.models);
  return useMemo(() => validateProject({ objects, order, layers, textures, models }), [objects, order, layers, textures, models]);
}
