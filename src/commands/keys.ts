/**
 * Key combos are stored as plain strings such as "mod+shift+z", "f2", "escape" or "?".
 * `mod` means Ctrl on Windows/Linux and Cmd on Mac. Letters are lower case.
 * Shift is only part of a combo for letters, digits and named keys: for "?" the key itself already says shift.
 */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS']);

export function comboFromEvent(e: KeyLike): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const named = e.key.length > 1;
  const key = e.key === ' ' ? 'space' : named ? e.key.toLowerCase() : e.key.toLowerCase();
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey && (named || key === 'space' || /^[a-z0-9]$/.test(key))) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

const NAMES: Record<string, string> = { escape: 'Esc', delete: 'Delete', backspace: 'Backspace', space: 'Space', home: 'Home', end: 'End', enter: 'Enter', tab: 'Tab', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', pageup: 'Page Up', pagedown: 'Page Down' };

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');
}

/** "mod+shift+z" -> ["Ctrl", "Shift", "Z"] (or ⌘ on Mac) for showing as separate keycaps. */
export function comboParts(combo: string): string[] {
  return combo.split('+').filter(Boolean).map((p) => {
    if (p === 'mod') return isMac() ? '⌘' : 'Ctrl';
    if (p === 'alt') return isMac() ? '⌥' : 'Alt';
    if (p === 'shift') return 'Shift';
    if (NAMES[p]) return NAMES[p];
    if (/^f\d{1,2}$/.test(p)) return p.toUpperCase();
    return p.length === 1 ? p.toUpperCase() : p;
  });
}

export const formatCombo = (combo: string): string => comboParts(combo).join(' + ');

/** True for combos that would break the browser or the page if bound (reload, close tab, copy, paste...). */
export function isReservedCombo(combo: string): boolean {
  return /^mod\+(c|v|x|r|w|t|n|q|l|p|f|a)$/.test(combo) || combo === 'f5' || combo === 'f12' || combo === 'tab' || combo === 'mod+k';
}
