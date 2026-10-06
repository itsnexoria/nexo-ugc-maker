import { useEffect, useState } from 'react';
import { useUI } from '../store/ui';

/** Tablet-sized windows get a compact layout: the right panel becomes a slide-over drawer. */
export const COMPACT_BELOW = 1100;
export const PHONE_BELOW = 720;

export function useCompact(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < COMPACT_BELOW);
  useEffect(() => {
    const on = () => setCompact(window.innerWidth < COMPACT_BELOW);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    // give the viewport the room: start with the bottom panel collapsed on small windows
    if (compact) useUI.setState({ bottomOpen: false, panelsOpen: false });
  }, [compact]);
  return compact;
}
