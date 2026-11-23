import { X } from 'lucide-react';
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { containTab, focusDialog } from './dialogFocus';
import {
  OwnedPickerLayerProvider,
  createOwnedPickerApi,
  dismissTopOwnedPicker,
  type OwnedPickerLayer,
} from './ownedPickerLayer';

const sizeClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-4xl',
  '3xl': 'max-w-5xl',
};

export type ModalFocusScope = {
  restoreTo: HTMLElement | null;
  suppressRestoreRef: { current: boolean };
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  header?: (labelId: string) => React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  size?: string;
  footer?: React.ReactNode;
  hideCloseButton?: boolean;
  /** Opt-in for the transport details editor. Other callers keep the previous focus behavior. */
  focusScope?: ModalFocusScope;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  header,
  children,
  size = 'md',
  footer,
  hideCloseButton = false,
  focusScope,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const mouseDownTarget = useRef<EventTarget | null>(null);
  const suppressBackdropClick = useRef(false);
  const rememberedRestore = useRef<HTMLElement | null>(null);
  const focusGeneration = useRef(0);
  const scopeRef = useRef(focusScope);
  scopeRef.current = focusScope;
  const hasScope = focusScope != null;
  const layers = useRef<OwnedPickerLayer[]>([]);
  const api = useMemo(() => createOwnedPickerApi(layers), []);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEsc]);

  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!isOpen || !scope) {
      rememberedRestore.current = null;
      return;
    }
    const generation = ++focusGeneration.current;
    if (rememberedRestore.current == null) {
      rememberedRestore.current = scope.restoreTo;
    }
    const panel = panelRef.current;
    if (panel) focusDialog(panel);
    const suppress = scope.suppressRestoreRef;
    return () => {
      const restoreOpener = rememberedRestore.current;
      queueMicrotask(() => {
        if (focusGeneration.current !== generation) return;
        if (suppress.current) return;
        if (!(restoreOpener instanceof HTMLElement) || !restoreOpener.isConnected) return;
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.isConnected && active !== document.body) {
          if (active.closest('[role="dialog"],[role="alertdialog"]')) return;
          if (active !== restoreOpener) return;
        }
        restoreOpener.focus();
      });
    };
  }, [isOpen, hasScope]);

  useEffect(() => {
    if (!isOpen || !hasScope) return;
    const onKey = (event: KeyboardEvent) => {
      const backdrop = backdropRef.current;
      const panel = panelRef.current;
      const target = event.target as Node | null;
      if (!panel || !target) return;
      if (event.key === 'Tab') {
        const top = api.top();
        const portal = top?.portal ?? null;
        if (portal) {
          const inPopup = portal.contains(target);
          const inModal = backdrop?.contains(target) === true || top?.trigger?.contains(target) === true;
          if (!inPopup && !inModal) return;
          containTab(event, portal);
          return;
        }
        if (backdrop?.contains(target)) containTab(event, panel);
        return;
      }
      if (event.key !== 'Escape') return;
      const top = api.top();
      if (!top) return;
      const inOurUi =
        top.portal?.contains(target) === true ||
        backdrop?.contains(target) === true ||
        top.trigger?.contains(target) === true;
      if (!inOurUi) return;
      if (!dismissTopOwnedPicker(api)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [api, hasScope, isOpen]);

  useEffect(() => {
    if (!isOpen || !hasScope) return;
    const onPointerDown = (event: PointerEvent) => {
      const top = api.top();
      if (!top?.portal || top.dismissOnBackdrop === false) return;
      const node = event.target as Node | null;
      const backdrop = backdropRef.current;
      const panel = panelRef.current;
      if (!node || !backdrop || !panel) return;
      if (top.portal.contains(node) || top.trigger?.contains(node) || panel.contains(node)) return;
      if (!backdrop.contains(node)) return;
      dismissTopOwnedPicker(api);
      suppressBackdropClick.current = true;
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [api, hasScope, isOpen]);

  if (!isOpen) return null;

  const panel = (
    <div
      ref={panelRef}
      role={hasScope ? 'dialog' : undefined}
      aria-labelledby={hasScope ? titleId : undefined}
      tabIndex={hasScope ? -1 : undefined}
      className={`trek-modal-enter w-full overflow-hidden rounded-2xl shadow-2xl ${header ? 'max-w-[720px]' : sizeClasses[size] || sizeClasses.md} flex max-h-[calc(100dvh-var(--bottom-nav-h)-90px)] flex-col bg-surface-card sm:max-h-[calc(100dvh-90px)] ${hasScope ? 'outline-none' : ''} `}
      onClick={(e) => e.stopPropagation()}
    >
      {header ? (
        header(titleId)
      ) : (
        <div className="flex flex-shrink-0 items-center justify-between border-b border-edge-secondary p-6">
          <h2 id={hasScope ? titleId : undefined} className="text-subtitle font-semibold text-content">
            {title}
          </h2>
          {!hideCloseButton && (
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-content-muted transition-colors hover:bg-surface-secondary hover:text-content-muted"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      <div
        className={
          header
            ? 'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6 pt-5'
            : 'min-h-0 flex-1 overflow-y-auto p-6'
        }
      >
        {children}
      </div>

      {footer && (
        <div
          className={
            header
              ? 'flex flex-none items-center gap-2 border-t border-edge-faint px-6 py-3.5'
              : 'flex-shrink-0 border-t border-edge-secondary p-6'
          }
        >
          {footer}
        </div>
      )}
    </div>
  );

  return ReactDOM.createPortal(
    <div
      ref={backdropRef}
      className="trek-modal-backdrop trek-backdrop-enter fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-[var(--overlay)] px-4 sm:items-center"
      style={{ paddingTop: 70, paddingBottom: 'calc(20px + var(--bottom-nav-h))', overflow: 'hidden' }}
      onMouseDown={(e) => {
        mouseDownTarget.current = e.target;
      }}
      onClick={(e) => {
        if (hasScope) {
          if (suppressBackdropClick.current) {
            suppressBackdropClick.current = false;
            mouseDownTarget.current = null;
            return;
          }
          const top = api.top();
          if (top?.portal && top.dismissOnBackdrop !== false) {
            mouseDownTarget.current = null;
            return;
          }
        }
        if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) onClose();
        mouseDownTarget.current = null;
      }}
    >
      {hasScope ? <OwnedPickerLayerProvider api={api}>{panel}</OwnedPickerLayerProvider> : panel}
    </div>,
    document.body
  );
}
