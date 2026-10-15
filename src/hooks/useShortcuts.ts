import { useEffect } from 'react';
import { dispatchKey } from '../commands/registry';
import { useEditor } from '../store/editor';

/**
 * One global key handler. Every shortcut is a command in commands/registry.ts, so the keys can be
 * rebound in Settings and every command is also reachable from the command palette (Ctrl+K).
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const screen = useEditor.getState().screen;
      if (screen !== 'editor' && screen !== 'clothing') return;
      if (dispatchKey(e, screen)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
