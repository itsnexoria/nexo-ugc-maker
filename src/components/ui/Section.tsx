import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
}

export function Section({ title, children, defaultOpen = true, actions }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <header className="section-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="grow">{title}</span>
        {actions && <span onClick={(e) => e.stopPropagation()}>{actions}</span>}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}
