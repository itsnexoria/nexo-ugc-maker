import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useUI } from '../../store/ui';

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'normal',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'normal' | 'wide' | 'narrow';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size === 'wide' ? 'wide' : size === 'narrow' ? 'narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2 className="grow">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmHost() {
  const confirm = useUI((s) => s.confirm);
  const close = useUI((s) => s.closeConfirm);
  if (!confirm) return null;
  return (
    <Modal
      title={confirm.title}
      size="narrow"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className={`btn ${confirm.danger ? 'danger solid' : 'primary'}`}
            autoFocus
            onClick={() => {
              const fn = confirm.onConfirm;
              close();
              fn();
            }}
          >
            {confirm.confirmLabel}
          </button>
        </>
      }
    >
      <p className="dim">{confirm.body}</p>
    </Modal>
  );
}

const ICONS = {
  info: <Info size={15} color="var(--info)" />,
  success: <CheckCircle2 size={15} color="var(--ok)" />,
  warn: <AlertTriangle size={15} color="var(--warn)" />,
  error: <XCircle size={15} color="var(--err)" />,
};

export function ToastHost() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {ICONS[t.kind]}
          <span className="grow">{t.message}</span>
          {t.action && (
            <button
              className="btn sm"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="icon-btn sm" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ContextMenuHost() {
  const menu = useUI((s) => s.contextMenu);
  const close = useUI((s) => s.closeContextMenu);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('wheel', close);
    };
  }, [menu, close]);

  // keep the menu inside the window
  useEffect(() => {
    const el = ref.current;
    if (!el || !menu) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 6) el.style.left = `${Math.max(6, window.innerWidth - r.width - 6)}px`;
    if (r.bottom > window.innerHeight - 6) el.style.top = `${Math.max(6, window.innerHeight - r.height - 6)}px`;
  }, [menu]);

  if (!menu) return null;
  return createPortal(
    <div className="ctx-menu" ref={ref} style={{ left: menu.x, top: menu.y }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, i) =>
        it.separator ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`ctx-item ${it.danger ? 'danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              close();
              it.onClick?.();
            }}
          >
            <span className="ctx-icon">{it.icon}</span>
            <span className="grow">{it.label}</span>
            {it.shortcut && <span className="kbd">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

export function BusyOverlay() {
  const busy = useUI((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="busy-overlay" role="alert" aria-busy="true">
      <div className="box">
        <div className="spinner" />
        <span>{busy}</span>
      </div>
    </div>
  );
}

export function PromptHost() {
  const prompt = useUI((s) => s.prompt);
  const close = useUI((s) => s.closePrompt);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (prompt) setValue(prompt.initial);
  }, [prompt]);
  if (!prompt) return null;
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    const fn = prompt.onSubmit;
    close();
    fn(v);
  };
  return (
    <Modal
      title={prompt.title}
      size="narrow"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={!value.trim()}>
            {prompt.confirmLabel}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="prompt-input">{prompt.label}</label>
        <input
          id="prompt-input"
          className="input"
          autoFocus
          value={value}
          maxLength={48}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
    </Modal>
  );
}
