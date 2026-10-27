import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { render, screen, fireEvent, waitFor } from '../../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';
import { useOwnedPickerLayer, useRegisterOwnedPicker } from './ownedPickerLayer';

describe('Modal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    document.body.style.overflow = '';
  });

  it('FE-COMP-MODAL-001: does not render when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={onClose}><p>content</p></Modal>);
    expect(screen.queryByText('content')).toBeNull();
  });

  it('FE-COMP-MODAL-002: renders overlay when isOpen is true', () => {
    render(<Modal isOpen={true} onClose={onClose}><p>content</p></Modal>);
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('FE-COMP-MODAL-003: renders the title prop', () => {
    render(<Modal isOpen={true} onClose={onClose} title="My Modal Title" />);
    expect(screen.getByText('My Modal Title')).toBeTruthy();
  });

  it('FE-COMP-MODAL-004: renders children content', () => {
    render(<Modal isOpen={true} onClose={onClose}><p>Hello World</p></Modal>);
    expect(screen.getByText('Hello World')).toBeTruthy();
  });

  it('FE-COMP-MODAL-005: renders footer prop', () => {
    render(
      <Modal isOpen={true} onClose={onClose} footer={<button>Save</button>}>
        <p>body</p>
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('FE-COMP-MODAL-006: close button calls onClose', async () => {
    const user = userEvent.setup();
    render(<Modal isOpen={true} onClose={onClose} title="T" />);
    // The X button is the only button rendered by Modal itself
    const closeBtn = document.querySelector('button');
    await user.click(closeBtn!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('FE-COMP-MODAL-007: Escape key calls onClose', () => {
    render(<Modal isOpen={true} onClose={onClose} title="T" />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('FE-COMP-MODAL-008: clicking the backdrop calls onClose', () => {
    render(<Modal isOpen={true} onClose={onClose}><p>inner</p></Modal>);
    const backdrop = document.querySelector('.trek-modal-backdrop') as HTMLElement;
    // Simulate mousedown then click on the backdrop itself
    fireEvent.mouseDown(backdrop, { target: backdrop });
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('FE-COMP-MODAL-009: clicking inside modal content does NOT call onClose', async () => {
    const user = userEvent.setup();
    render(<Modal isOpen={true} onClose={onClose}><p>inner content</p></Modal>);
    await user.click(screen.getByText('inner content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('FE-COMP-MODAL-010: close button is hidden when hideCloseButton is true', () => {
    render(<Modal isOpen={true} onClose={onClose} title="T" hideCloseButton={true} />);
    // No button should be present in the modal header
    expect(document.querySelector('button')).toBeNull();
  });

  it('FE-COMP-MODAL-011: sets document.body overflow to hidden when open', () => {
    render(<Modal isOpen={true} onClose={onClose} />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('does not move focus or register a picker when focusScope is omitted', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Outside';
    document.body.appendChild(opener);
    opener.focus();
    render(
      <Modal isOpen={true} onClose={onClose} title="Plain">
        <ScopeProbe />
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(screen.getByTestId('picker-scope')).toHaveTextContent('unowned');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    opener.remove();
  });
});

function ScopeProbe({ openMenu = false }: { openMenu?: boolean }) {
  const api = useOwnedPickerLayer();
  const [open, setOpen] = useState(openMenu);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  useRegisterOwnedPicker(open, triggerRef, portalRef, () => setOpen(false));
  return (
    <div>
      <span data-testid="picker-scope">{api ? 'owned' : 'unowned'}</span>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Open menu</button>
      {open && ReactDOM.createPortal(
        <div ref={portalRef}>
          <button type="button">First choice</button>
          <button type="button">Second choice</button>
        </div>,
        document.body,
      )}
    </div>
  );
}

describe('Modal focusScope', () => {
  it('restores the original opener after close and skips StrictMode replay', async () => {
    const restore = document.createElement('button');
    restore.textContent = 'Title';
    document.body.appendChild(restore);
    const suppressRestoreRef = { current: false };
    const scope = { restoreTo: restore, suppressRestoreRef };
    const { rerender } = render(
      <React.StrictMode>
        <Modal isOpen onClose={vi.fn()} title="Scoped" focusScope={scope}>
          <input aria-label="Name" />
        </Modal>
      </React.StrictMode>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Scoped' });
    expect(dialog).toHaveFocus();
    expect(restore).not.toHaveFocus();
    rerender(
      <React.StrictMode>
        <Modal isOpen={false} onClose={vi.fn()} title="Scoped" focusScope={scope} />
      </React.StrictMode>,
    );
    await waitFor(() => expect(restore).toHaveFocus());
    restore.remove();
  });

  it('does not restore focus when the Costs suppress flag is set', async () => {
    const restore = document.createElement('button');
    restore.textContent = 'Title';
    document.body.appendChild(restore);
    const suppressRestoreRef = { current: true };
    const { rerender } = render(
      <Modal isOpen onClose={vi.fn()} title="Scoped" focusScope={{ restoreTo: restore, suppressRestoreRef }}>
        <p>Editor</p>
      </Modal>,
    );
    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="Scoped" focusScope={{ restoreTo: restore, suppressRestoreRef }} />,
    );
    await waitFor(() => expect(screen.queryByText('Editor')).toBeNull());
    expect(restore).not.toHaveFocus();
    restore.remove();
  });

  it('keeps Tab and Escape inside one registered popup and one backdrop gesture', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const restore = document.createElement('button');
    document.body.appendChild(restore);
    render(
      <Modal isOpen onClose={onClose} title="Scoped" focusScope={{ restoreTo: restore, suppressRestoreRef: { current: false } }}>
        <ScopeProbe />
      </Modal>,
    );
    expect(screen.getByTestId('picker-scope')).toHaveTextContent('owned');
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const first = await screen.findByRole('button', { name: 'First choice' });
    const second = screen.getByRole('button', { name: 'Second choice' });
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(second).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Scoped' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'First choice' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await screen.findByRole('button', { name: 'First choice' });
    const backdrop = document.querySelector('.trek-modal-backdrop') as HTMLElement;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'First choice' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Scoped' })).toBeInTheDocument();
    restore.remove();
  });

  it('leaves a modal without focusScope on its own close path', () => {
    const scopedClose = vi.fn();
    const plainClose = vi.fn();
    render(
      <>
        <Modal isOpen onClose={scopedClose} title="Scoped" focusScope={{ restoreTo: null, suppressRestoreRef: { current: false } }}>
          <p>Scoped body</p>
        </Modal>
        <Modal isOpen onClose={plainClose} title="Plain">
          <button type="button">Plain action</button>
        </Modal>
      </>,
    );
    expect(screen.getByRole('dialog', { name: 'Scoped' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Plain' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Plain action' }), { key: 'Escape' });
    expect(plainClose).toHaveBeenCalled();
    expect(scopedClose).toHaveBeenCalled();
  });
});
