import { useEffect, useRef } from 'react';

/**
 * Minimal confirm dialog (rename-resolution "should I repoint everything?"
 * and any future destructive/impacting action). Reuses the Add Widget
 * overlay/panel pattern; Escape cancels, the confirm button is focused.
 */
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="add-widget-overlay" onClick={onCancel}>
      <div className="add-widget-panel confirm-panel" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <div className="confirm-title">{title}</div>
        {message && <div className="confirm-message">{message}</div>}
        <div className="confirm-actions">
          <button className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn btn-primary" ref={confirmRef} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}