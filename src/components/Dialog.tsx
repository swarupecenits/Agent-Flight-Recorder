import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({ title, open, onClose, children, wide = false }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current;
    if (open && element && !element.open) element.showModal();
    if (!open && element?.open) element.close();
  }, [open]);
  return <dialog ref={ref} className={`workbench-dialog${wide ? ' dialog-wide' : ''}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="dialog-header"><h2 id={titleId}>{title}</h2>
      <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} aria-hidden="true" /></button>
    </header>
    {open ? children : null}
  </dialog>;
}
