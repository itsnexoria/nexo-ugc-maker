import { cloneElement, useCallback, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  label: string;
  shortcut?: string;
  side?: 'right' | 'bottom' | 'top' | 'left';
  children: ReactElement;
}

/** Portal-based tooltip so it is never clipped by scrolling panels. */
export function Tip({ label, shortcut, side = 'bottom', children }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const gap = 8;
      let x = r.left + r.width / 2;
      let y = r.bottom + gap;
      if (side === 'right') {
        x = r.right + gap;
        y = r.top + r.height / 2;
      } else if (side === 'left') {
        x = r.left - gap;
        y = r.top + r.height / 2;
      } else if (side === 'top') {
        y = r.top - gap;
      }
      setPos({ x, y });
    },
    [side],
  );

  const child = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      children.props.onMouseEnter?.(e);
      const el = e.currentTarget;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => show(el), 350);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      children.props.onMouseLeave?.(e);
      if (timer.current) clearTimeout(timer.current);
      setPos(null);
    },
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      children.props.onMouseDown?.(e);
      if (timer.current) clearTimeout(timer.current);
      setPos(null);
    },
  });

  const transform =
    side === 'right' ? 'translate(0,-50%)' : side === 'left' ? 'translate(-100%,-50%)' : side === 'top' ? 'translate(-50%,-100%)' : 'translate(-50%,0)';

  return (
    <>
      {child}
      {pos &&
        createPortal(
          <div className="tooltip" role="tooltip" style={{ left: pos.x, top: pos.y, transform }}>
            {label}
            {shortcut && <span className="kbd">{shortcut}</span>}
          </div>,
          document.body,
        )}
    </>
  );
}
