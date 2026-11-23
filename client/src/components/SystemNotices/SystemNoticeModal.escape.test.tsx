import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '../../../tests/helpers/render';

import { useSystemNoticeStore, type SystemNoticeDTO } from '../../store/systemNoticeStore';
import { ModalRenderer } from './SystemNoticeModal';

vi.mock('react-markdown', () => ({ default: ({ children }: { children: string }) => <span>{children}</span> }));
vi.mock('remark-gfm', () => ({ default: () => ({}) }));
vi.mock('rehype-sanitize', () => ({ default: () => ({}) }));

const originalDismiss = useSystemNoticeStore.getState().dismiss;
let originalMatchMedia: typeof window.matchMedia;
let originalRaf: typeof globalThis.requestAnimationFrame;

function notice(id: string): SystemNoticeDTO {
  return { id, display: 'modal', severity: 'info', titleKey: id, bodyKey: id + ' body', dismissible: true };
}

async function settle(): Promise<void> {
  await act(async () => {
    vi.runAllTimers();
  });
}

/** The native phone sheet mounts adjacent slots; interact with its center pager. */
function currentSlot(mobile: boolean): HTMLElement {
  const dialog = screen.getByRole('dialog');
  if (!mobile) return dialog;
  const center = dialog.children[1]?.children[0]?.children[1];
  if (!(center instanceof HTMLElement)) throw new Error('Native notice center slot missing');
  return center;
}

function keydownRegistrations(spy: { mock: { calls: readonly (readonly [type: string, ...unknown[]])[] } }): number {
  return spy.mock.calls.filter(([type]) => type === 'keydown').length;
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  originalRaf = globalThis.requestAnimationFrame;
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', undefined);
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, writable: true, value: vi.fn() });
  useSystemNoticeStore.setState({ notices: [], loaded: true, dismiss: originalDismiss });
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
  globalThis.requestAnimationFrame = originalRaf;
  document.body.style.overflow = '';
  useSystemNoticeStore.setState({ notices: [], loaded: true, dismiss: originalDismiss });
});

describe.each([false, true])('notice Escape callback with mobile=%s', (mobile) => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion') || (mobile && query.includes('max-width')),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
  });

  it('dismisses the current preceding notice after a same-page list replacement without rebinding listeners', async () => {
    const a = notice('earlier-a');
    const b = notice('current-b');
    const c = notice('replacement-c');
    const dismiss = vi.fn();
    useSystemNoticeStore.setState({ notices: [a, b], dismiss });
    const { rerender } = render(<ModalRenderer notices={[a, b]} />);
    await settle();
    fireEvent.click(within(currentSlot(mobile)).getByLabelText('Go to notice 2'));
    await settle();
    expect(document.body.style.overflow).toBe('hidden');
    const adds = vi.spyOn(document, 'addEventListener');
    const removes = vi.spyOn(document, 'removeEventListener');

    await act(async () => {
      useSystemNoticeStore.setState({ notices: [c, b] });
      rerender(<ModalRenderer notices={[c, b]} />);
    });
    expect(within(currentSlot(mobile)).getByText('current-b')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.body.style.overflow).toBe('hidden');
    expect(keydownRegistrations(adds)).toBe(0);
    expect(keydownRegistrations(removes)).toBe(0);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(dismiss.mock.calls).toEqual([['replacement-c'], ['current-b']]);
  });

  it('uses the current dismiss operation after a same-page store update without rebinding listeners', async () => {
    const a = notice('earlier-a');
    const b = notice('current-b');
    const first = vi.fn();
    const current = vi.fn();
    useSystemNoticeStore.setState({ notices: [a, b], dismiss: first });
    render(<ModalRenderer notices={[a, b]} />);
    await settle();
    fireEvent.click(within(currentSlot(mobile)).getByLabelText('Go to notice 2'));
    await settle();
    const adds = vi.spyOn(document, 'addEventListener');
    const removes = vi.spyOn(document, 'removeEventListener');

    await act(async () => {
      useSystemNoticeStore.setState({ dismiss: current });
    });
    expect(keydownRegistrations(adds)).toBe(0);
    expect(keydownRegistrations(removes)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(current.mock.calls).toEqual([['earlier-a'], ['current-b']]);
    expect(first).not.toHaveBeenCalled();
  });

  it('keeps Escape inactive on a preceding page after a dismiss operation update', async () => {
    const a = notice('earlier-a');
    const b = notice('current-b');
    const first = vi.fn();
    const current = vi.fn();
    useSystemNoticeStore.setState({ notices: [a, b], dismiss: first });
    render(<ModalRenderer notices={[a, b]} />);
    await settle();
    await act(async () => {
      useSystemNoticeStore.setState({ dismiss: current });
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
  });

  it('removes the Escape listener when the latest render unmounts', async () => {
    const b = notice('current-b');
    const first = vi.fn();
    const current = vi.fn();
    useSystemNoticeStore.setState({ notices: [b], dismiss: first });
    const { unmount } = render(<ModalRenderer notices={[b]} />);
    await settle();
    await act(async () => {
      useSystemNoticeStore.setState({ dismiss: current });
    });
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });
});
