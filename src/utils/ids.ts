let counter = 0;
export function uid(prefix = 'id'): string {
  const c = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : '';
  counter += 1;
  return `${prefix}_${c || Math.random().toString(36).slice(2, 10)}${counter.toString(36)}`;
}
