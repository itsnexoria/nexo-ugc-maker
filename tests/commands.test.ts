import { beforeEach, describe, expect, it } from 'vitest';
import { comboFromEvent, comboParts, formatCombo, isReservedCombo } from '../src/commands/keys';
import { conflictFor, dispatchKey, effectiveKeys, findCommand, getCommands, searchCommands, withBinding } from '../src/commands/registry';
import { useClothing } from '../src/store/clothing';
import { useEditor } from '../src/store/editor';
import { useSettings } from '../src/store/settings';
import { useUI } from '../src/store/ui';

const ev = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; target: unknown }> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: document.body, ...o }) as unknown as KeyboardEvent;

describe('key combos', () => {
  it('normalises key presses', () => {
    expect(comboFromEvent(ev('z', { ctrlKey: true, shiftKey: true }))).toBe('mod+shift+z');
    expect(comboFromEvent(ev('Z', { metaKey: true }))).toBe('mod+z');
    expect(comboFromEvent(ev('Delete'))).toBe('delete');
    expect(comboFromEvent(ev('F2'))).toBe('f2');
    expect(comboFromEvent(ev('?', { shiftKey: true }))).toBe('?');
    expect(comboFromEvent(ev(' '))).toBe('space');
    expect(comboFromEvent(ev('Escape'))).toBe('escape');
  });
  it('ignores a bare modifier', () => {
    expect(comboFromEvent(ev('Shift', { shiftKey: true }))).toBeNull();
    expect(comboFromEvent(ev('Control', { ctrlKey: true }))).toBeNull();
  });
  it('formats for display', () => {
    expect(comboParts('mod+shift+z')).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(formatCombo('escape')).toBe('Esc');
    expect(formatCombo('f2')).toBe('F2');
  });
  it('protects browser shortcuts', () => {
    expect(isReservedCombo('mod+c')).toBe(true);
    expect(isReservedCombo('mod+k')).toBe(true);
    expect(isReservedCombo('g')).toBe(false);
  });
});

describe('command registry', () => {
  const commands = getCommands();

  it('has unique ids', () => {
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
  });

  it('never gives two commands the same default key on one screen', () => {
    for (const screen of ['editor', 'clothing'] as const) {
      const seen = new Map<string, string>();
      for (const c of commands.filter((x) => x.screens.includes(screen))) {
        for (const k of c.keys ?? []) {
          expect(seen.get(k), `${k} on ${screen}: ${seen.get(k)} and ${c.id}`).toBeUndefined();
          seen.set(k, c.id);
          expect(isReservedCombo(k) && k !== 'mod+s' && k !== 'mod+a' && k !== 'mod+z', `${c.id} uses reserved ${k}`).toBe(false);
        }
      }
    }
  });

  it('keeps every shortcut the editor always had', () => {
    const keyOf = (screen: 'editor' | 'clothing', combo: string) => findCommand(commands, combo, screen, {})?.id;
    expect(keyOf('editor', 'mod+s')).toBe('file.save');
    expect(keyOf('editor', 'mod+y')).toBe('edit.redo');
    expect(keyOf('editor', 'mod+shift+z')).toBe('edit.redo');
    expect(keyOf('editor', 'delete')).toBe('edit.delete');
    expect(keyOf('editor', 'backspace')).toBe('edit.delete');
    expect(keyOf('editor', 'w')).toBe('tool.move');
    expect(keyOf('editor', '3')).toBe('view.left');
    expect(keyOf('editor', 'home')).toBe('view.reset');
    expect(keyOf('clothing', 'b')).toBe('ctool.brush');
    expect(keyOf('clothing', 't')).toBe('layer.text');
    expect(keyOf('clothing', 'mod+a')).toBe('edit.selectAll');
    expect(keyOf('clothing', 'w')).toBeUndefined();
  });

  it('rebinding replaces the default and detects clashes', () => {
    const move = commands.find((c) => c.id === 'tool.move')!;
    const o = withBinding({}, move, 'm');
    expect(effectiveKeys(move, o)).toEqual(['m']);
    expect(findCommand(commands, 'w', 'editor', o)).toBeUndefined();
    expect(findCommand(commands, 'm', 'editor', o)?.id).toBe('tool.move');
    expect(conflictFor(commands, 'v', 'tool.move', 'editor', o)?.id).toBe('tool.select');
    expect(conflictFor(commands, 'm', 'tool.move', 'editor', o)).toBeUndefined();
    // same screen only: clothing's brush key does not clash with an editor command
    expect(conflictFor(commands, 'b', 'tool.move', 'clothing', o)?.id).toBe('ctool.brush');
  });

  it('going back to the default (or reset) removes the override; "" unbinds', () => {
    const move = commands.find((c) => c.id === 'tool.move')!;
    expect(withBinding({ 'tool.move': 'm' }, move, 'w')).toEqual({});
    expect(withBinding({ 'tool.move': 'm' }, move, null)).toEqual({});
    const unbound = withBinding({}, move, '');
    expect(effectiveKeys(move, unbound)).toEqual([]);
  });
});

describe('dispatchKey', () => {
  beforeEach(() => {
    useSettings.setState({ shortcuts: {} });
    useUI.setState({ modal: null, confirm: null, prompt: null });
    useEditor.setState({ screen: 'editor', tool: 'select' });
  });

  it('runs the command for a key', () => {
    expect(dispatchKey(ev('w') as never, 'editor')).toBe(true);
    expect(useEditor.getState().tool).toBe('move');
  });

  it('uses a rebound key instead of the default', () => {
    useSettings.setState({ shortcuts: { 'tool.rotate': 'q' } });
    expect(dispatchKey(ev('e') as never, 'editor')).toBe(false);
    expect(useEditor.getState().tool).toBe('select');
    expect(dispatchKey(ev('q') as never, 'editor')).toBe(true);
    expect(useEditor.getState().tool).toBe('rotate');
  });

  it('ignores plain keys while typing or while a dialog is open', () => {
    const input = document.createElement('input');
    expect(dispatchKey(ev('w', { target: input }) as never, 'editor')).toBe(false);
    useUI.setState({ modal: 'settings' });
    expect(dispatchKey(ev('w') as never, 'editor')).toBe(false);
    expect(useEditor.getState().tool).toBe('select');
  });

  it('does not swallow Delete when nothing is selected', () => {
    useEditor.setState({ selectedId: null });
    expect(dispatchKey(ev('Delete') as never, 'editor')).toBe(false);
  });

  it('opens and closes the palette with Ctrl+K, even while typing', () => {
    const input = document.createElement('input');
    expect(dispatchKey(ev('k', { ctrlKey: true, target: input }) as never, 'editor')).toBe(true);
    expect(useUI.getState().modal).toBe('palette');
    expect(dispatchKey(ev('k', { ctrlKey: true }) as never, 'editor')).toBe(true);
    expect(useUI.getState().modal).toBeNull();
  });

  it('clothing screen: tool keys switch the clothing tool', () => {
    useClothing.getState().setTool('select');
    expect(dispatchKey(ev('b') as never, 'clothing')).toBe(true);
    expect(useClothing.getState().tool).toBe('brush');
  });
});

describe('palette search', () => {
  const commands = getCommands().filter((c) => c.screens.includes('editor'));
  it('returns everything for an empty query', () => {
    expect(searchCommands(commands, '  ')).toHaveLength(commands.length);
  });
  it('needs every word, in any order', () => {
    const r = searchCommands(commands, 'tool move').map((c) => c.id);
    expect(r).toContain('tool.move');
    expect(r).not.toContain('tool.rotate');
    expect(searchCommands(commands, 'xyzzy')).toEqual([]);
  });
  it('ranks word-start matches first', () => {
    expect(searchCommands(commands, 'export')[0].title).toMatch(/^Export/);
  });
});
