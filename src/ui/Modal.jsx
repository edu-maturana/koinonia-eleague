import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.jsx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Ventana modal: Escape o clic fuera cierran, el foco queda dentro y vuelve a quien la abrió. */
export function Modal({ title, onClose, children, wide = false, className = '' }) {
  const box = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    box.current?.querySelector(FOCUSABLE)?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, []);
  return createPortal(<div className="ui-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`ui-modal ${wide ? 'ui-modal--wide' : ''} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title} ref={box}>
      <header><h2>{title}</h2><Button variant="ghost" size="sm" aria-label="Cerrar" onClick={onClose}>✕</Button></header>
      <div className="ui-modal__body">{children}</div>
    </div>
  </div>, document.body);
}

/** Confirmación en línea: pregunta + confirmar/volver, para acciones que mueven plata. */
export function ConfirmStep({ message, confirmLabel = 'SÍ', cancelLabel = 'VOLVER', busy = false, danger = false, onConfirm, onCancel }) {
  return <div className="ui-confirm" role="group" aria-label="Confirmación">
    <span>{message}</span>
    <div><Button variant={danger ? 'danger' : 'positive'} size="sm" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button><Button variant="ghost" size="sm" onClick={onCancel}>{cancelLabel}</Button></div>
  </div>;
}
