import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';

/**
 * Lives inside a 3D canvas. If the scene stays slow for several seconds on Medium or High, offer
 * to switch to a lighter quality once per session. It only measures; it never changes anything by itself.
 */
let offered = false;

export function PerfWatch() {
  const acc = useRef({ t: 0, frames: 0, warm: 0 });
  useFrame((_, dt) => {
    if (offered || dt > 0.25) return; // ignore hidden-tab stalls
    const q = useSettings.getState().quality;
    if (q === 'low') return;
    try {
      if (localStorage.getItem('nexo-perf-dismissed') === '1') return;
    } catch {
      /* ignore */
    }
    const a = acc.current;
    a.warm += dt;
    if (a.warm < 3) return; // let the scene settle first
    a.t += dt;
    a.frames += 1;
    if (a.t < 5) return;
    const avgMs = (a.t / a.frames) * 1000;
    a.t = 0;
    a.frames = 0;
    if (avgMs < 40) return;
    offered = true;
    const next = q === 'high' ? 'medium' : 'low';
    useUI.getState().toast('warn', `The 3D view is running slowly (about ${Math.round(1000 / avgMs)} fps). Switch to ${next} quality?`, {
      label: `Use ${next}`,
      onClick: () => useSettings.getState().set('quality', next),
    });
    try {
      localStorage.setItem('nexo-perf-dismissed', '1');
    } catch {
      /* ignore */
    }
  });
  return null;
}
