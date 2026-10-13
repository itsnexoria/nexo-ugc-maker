import type { ProjectData } from '../types';
import { useClothing } from './clothing';
import { useEditor } from './editor';

/** The open project exactly as it should be stored or exported (clothing projects include their designs). */
export function serializeCurrentProject(): ProjectData {
  const ed = useEditor.getState();
  return ed.screen === 'clothing' ? { ...ed.serialize(), clothing: useClothing.getState().serialize() } : ed.serialize();
}
