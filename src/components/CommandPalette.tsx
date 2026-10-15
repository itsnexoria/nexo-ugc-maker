import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { effectiveKeys, getCommands, searchCommands, type CommandScreen } from '../commands/registry';
import { comboParts } from '../commands/keys';
import { useEditor } from '../store/editor';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';

/** Ctrl+K: type to find any command and press Enter to run it. */
export function CommandPalette() {
  const close = useUI((s) => s.closeModal);
  const screen = useEditor((s) => s.screen);
  const overrides = useSettings((s) => s.shortcuts);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo(() => getCommands().filter((c) => c.screens.includes(screen as CommandScreen) && (!c.enabled || c.enabled())), [screen]);
  const results = useMemo(() => searchCommands(commands, query), [commands, query]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => prev?.focus?.();
  }, []);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (i: number) => {
    const cmd = results[i];
    if (!cmd) return;
    close();
    // let the palette unmount (and return focus) before the command acts
    setTimeout(() => cmd.run(), 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(active);
    } else if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return createPortal(
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Search size={15} aria-hidden="true" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command…"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            aria-label="Search commands"
            spellCheck={false}
          />
        </div>
        <ul id="palette-list" className="palette-list" role="listbox" aria-label="Commands" ref={listRef}>
          {results.length === 0 && <li className="palette-empty">No command matches “{query}”.</li>}
          {results.map((c, i) => (
            <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseMove={() => setActive(i)} onMouseDown={(e) => (e.preventDefault(), run(i))}>
              <span className="palette-group">{c.group}</span>
              <span className="grow">{c.title}</span>
              <span className="palette-keys">
                {effectiveKeys(c, overrides)
                  .slice(0, 1)
                  .map((k) => comboParts(k).map((p, j) => (
                    <span key={j} className="kbd">
                      {p}
                    </span>
                  )))}
              </span>
            </li>
          ))}
        </ul>
        <div className="palette-foot hint">↑ ↓ to choose, Enter to run, Esc to close</div>
      </div>
    </div>,
    document.body,
  );
}
