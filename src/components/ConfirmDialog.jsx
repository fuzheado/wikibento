import { useEffect, useRef } from 'react';

/**
 * Minimal confirm dialog (rename-resolution "should I repoint everything?" and any future
 * destructive/impacting action). Reuses the Add Widget overlay/panel pattern; Escape cancels, the
 * confirm button is focused.
 *
 * An optional `secondaryLabel`/`onSecondary` adds a third path for actions where "cancel or confirm"
 * is not enough — Reset offers two *different* fresh starts (a blank board, or the starter set), and
 * neither is the "no" answer.
 */
export default function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel,
  secondaryLabel, onSecondary,
}) {
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
          {secondaryLabel && onSecondary && (
            <button className="btn" onClick={onSecondary}>{secondaryLabel}</button>
          )}
          <button className="btn btn-primary" ref={confirmRef} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
