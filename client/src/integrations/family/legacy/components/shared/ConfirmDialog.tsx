import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from '../../i18n';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Opt-in for the booking-details pilot. Other callers keep the previous focus behavior. */
  initialFocus?: 'cancel';
  restoreFocusTo?: HTMLElement | null;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
  initialFocus,
  restoreFocusTo = null,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focusGeneration = useRef(0);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, handleEsc]);

  useLayoutEffect(() => {
    if (!isOpen || (!initialFocus && !restoreFocusTo)) return;
    const generation = ++focusGeneration.current;
    if (initialFocus === 'cancel') cancelRef.current?.focus();
    return () => {
      const restore = restoreFocusTo;
      queueMicrotask(() => {
        if (focusGeneration.current !== generation) return;
        if (!(restore instanceof HTMLElement) || !restore.isConnected) return;
        restore.focus();
      });
    };
  }, [isOpen, initialFocus, restoreFocusTo]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      className="trek-backdrop-enter fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-[var(--overlay)] px-4"
      style={{ paddingBottom: 'var(--bottom-nav-h)' }}
      onClick={onClose}
    >
      <div
        className="trek-modal-enter w-full max-w-sm rounded-2xl bg-surface-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {danger && (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger-soft">
              <AlertTriangle className="h-5 w-5 text-danger" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-body font-semibold text-content">{title || t('common.confirm')}</h3>
            <p className="mt-1 text-body text-content-secondary">{message}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-edge-secondary px-4 py-2 text-body font-medium text-content-secondary transition-colors"
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-lg px-4 py-2 text-body font-medium text-inverse-text transition-colors ${
              danger ? 'bg-danger hover:bg-danger' : 'bg-info hover:bg-info'
            }`}
          >
            {confirmLabel || t('common.delete')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
