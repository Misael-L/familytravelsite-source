import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installConversationFixture,
  message,
  seedChat,
  status,
  store,
  stream,
} from '../../../tests/helpers/assistantConversations';
import { deferred, notifications, observe, switchAccount, wrapper } from '../../../tests/helpers/assistantPreferences';
import { buildTrip } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { render as renderNative } from '../../../tests/helpers/render';
import AssistantPrivacyBanner from '../../components/Assistant/AssistantPrivacyBanner';
import AssistantSurface from '../../components/Assistant/AssistantSurface';
import { AssistantViewContext } from '../../components/Assistant/assistantViewContext';
import { useAssistantAttach } from '../../components/Assistant/useAssistantAttach';
import { useAssistantShare } from '../../components/Assistant/useAssistantShare';
import StudioAssistantPanel from '../../components/Studio/StudioAssistantPanel';
import type { StudioAssistant } from '../../components/Studio/useStudioAssistant';
import { aiConnectionsRepo } from '../../repo/aiConnectionsRepo';
import { assistantRepo } from '../../repo/assistantRepo';
import { useAddonStore } from '../../store/addonStore';
import { useAssistantStore } from '../../store/assistantStore';
import { useAuthStore } from '../../store/authStore';
import { usePermissionsStore } from '../../store/permissionsStore';
import { useTripStore } from '../../store/tripStore';
import { setForcedOffline } from '../../sync/networkMode';
import * as familyRuntime from './runtime';

installConversationFixture();
const answer = (text = 'Original answer', id = 'msg-700') => ({
  ...message(text, id),
  parts: [
    { type: 'text' as const, text },
    {
      type: 'tool-call' as const,
      toolCallId: 'c1',
      toolName: 'create_place',
      args: {},
      approval: { id: 'c1', approved: true },
    },
    {
      type: 'data-trek-change' as const,
      data: {
        toolCallId: 'c1',
        verbKey: 'addPlace' as const,
        subject: 'Fixture Park',
        rows: [],
        dayId: 1,
        placeIds: [],
        undoable: true,
      },
    },
    {
      type: 'data-trek-applied' as const,
      data: { toolCallId: 'c1', entity: 'place' as const, ids: [42], dayId: 1, undoUntil: null },
    },
  ],
});
function seed(stored = answer(), key = 101) {
  useTripStore.setState({ trip: buildTrip({ id: key, user_id: useAuthStore.getState().user?.id ?? 1201 }) });
  useAddonStore.setState({
    loaded: true,
    collabChat: true,
    addons: [{ id: 'collab', name: 'Collab', type: 'trip', icon: '', enabled: true }],
  });
  seedChat(key, { messages: [stored] });
}
const shareHook = (stored = answer()) =>
  renderHook(({ item, key }) => useAssistantShare(key, item, false), {
    initialProps: { item: stored, key: 101 },
    wrapper,
  });
const consent = (key = 101) =>
  renderNative(
    <AssistantViewContext.Provider value={{ tripId: key, variant: 'window' }}>
      <AssistantPrivacyBanner />
    </AssistantViewContext.Provider>
  );
function panel(key = -301): StudioAssistant {
  return { chatKey: key, available: true, open: true, toggle: vi.fn(), jobs: [], drawn: vi.fn(async () => {}) };
}
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn() as typeof Element.prototype.scrollTo;
});
beforeEach(() => {
  seed();
  notifications.mockClear();
  vi.spyOn(assistantRepo, 'attach').mockImplementation(async () => stream());
  vi.spyOn(assistantRepo, 'send').mockImplementation(async () => stream());
});

const retire = {
  account: () => switchAccount(),
  relogin: () => switchAccount(true),
  selection: async () => {
    store().newThread(101);
  },
};

describe('attachment and native file/paste/drop ownership', () => {
  it.each(['booking.PDF', 'photo.JPG', 'walk.gpx'])(
    'keeps the native first-file acceptance contract for %s',
    async (name) => {
      const attach = vi.spyOn(store(), 'attach').mockResolvedValue();
      const view = renderHook(() => useAssistantAttach(101), { wrapper });
      const first = new File(['fixture'], name),
        second = new File(['skip'], 'other.pdf');
      act(() => expect(view.result.current.take([first, second])).toBe(true));
      expect(attach).toHaveBeenCalledOnce();
      expect(attach).toHaveBeenCalledWith(101, first);
      expect(view.result.current.accept).toContain('.pdf');
      expect(view.result.current.accept).toContain('.gpx');
    }
  );
  it('retains native unsupported, size-limit, empty and busy behavior without uploads', () => {
    const attach = vi.spyOn(store(), 'attach').mockResolvedValue(),
      view = renderHook(() => useAssistantAttach(101), { wrapper });
    act(() => {
      expect(view.result.current.take(null)).toBe(false);
      expect(view.result.current.take([])).toBe(false);
      view.result.current.take([new File(['x'], 'bad.exe')]);
    });
    expect(notifications.mock.calls[0][1]).toBe('warning');
    notifications.mockClear();
    const big = new File(['x'], 'big.pdf');
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    act(() => {
      view.result.current.take([big]);
    });
    expect(notifications.mock.calls[0][1]).toBe('warning');
    expect(attach).not.toHaveBeenCalled();
  });
  it.each(['isRunning', 'loading'] as const)(
    'rechecks current %s when an earlier take callback is invoked',
    (field) => {
      const attach = vi.spyOn(store(), 'attach').mockResolvedValue(),
        view = renderHook(() => useAssistantAttach(101), { wrapper });
      const take = view.result.current.take;
      act(() => seedChat(101, { [field]: true }));
      act(() => expect(take([new File(['x'], 'ok.pdf')])).toBe(true));
      expect(attach).not.toHaveBeenCalled();
      expect(notifications).not.toHaveBeenCalled();
    }
  );
  it.each([0, -301])('offers no booking attachment for native scope %s', (key) => {
    const attach = vi.spyOn(store(), 'attach').mockResolvedValue(),
      view = renderHook(() => useAssistantAttach(key), { wrapper });
    expect(view.result.current.canAttach).toBe(false);
    expect(view.result.current.take([new File(['x'], 'ok.pdf')])).toBe(false);
    expect(attach).not.toHaveBeenCalled();
  });
  it.each(Object.entries(retire))('retires retained take/validation after %s', async (_, end) => {
    const attach = vi.spyOn(store(), 'attach').mockResolvedValue(),
      view = renderHook(() => useAssistantAttach(101), { wrapper }),
      old = view.result.current.take;
    await act(async () => end());
    act(() => {
      expect(old([new File(['x'], 'bad.exe')])).toBe(false);
      expect(old([new File(['x'], 'ok.pdf')])).toBe(false);
    });
    expect(attach).not.toHaveBeenCalled();
    expect(notifications).not.toHaveBeenCalled();
  });
  it.each(['unmount', 'key'] as const)('retires retained take after %s', (end) => {
    const attach = vi.spyOn(store(), 'attach').mockResolvedValue(),
      view = renderHook(({ key }) => useAssistantAttach(key), { initialProps: { key: 101 }, wrapper });
    const take = view.result.current.take;
    if (end === 'unmount') view.unmount();
    else view.rerender({ key: 102 });
    expect(take([new File(['x'], 'ok.pdf')])).toBe(false);
    expect(attach).not.toHaveBeenCalled();
  });
  it('owns real native drop state and uploads only the first dropped file', () => {
    function Drop({ id }: { id: number }) {
      const a = useAssistantAttach(id);
      return (
        <div data-testid="zone" {...a.dropZone}>
          <span>{a.dragging ? 'dragging' : 'idle'}</span>
        </div>
      );
    }
    const attach = vi.spyOn(store(), 'attach').mockResolvedValue(),
      view = renderNative(<Drop id={101} />);
    const zone = screen.getByTestId('zone'),
      file = new File(['x'], 'drop.pdf');
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files: [file] } });
    expect(screen.getByText('dragging')).toBeInTheDocument();
    fireEvent(zone, new MouseEvent('dragleave', { bubbles: true, relatedTarget: zone.firstChild }));
    expect(screen.getByText('dragging')).toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [file, new File(['x'], 'skip.pdf')] } });
    expect(attach).toHaveBeenCalledWith(101, file);
    expect(screen.getByText('idle')).toBeInTheDocument();
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files: [file] } });
    view.rerender(<Drop id={102} />);
    expect(screen.getByText('idle')).toBeInTheDocument();
  });
  it('uses the real composer picker, clears the input and ignores unattributed or duplicate changes', async () => {
    useAssistantStore.setState({ status: { ...status(), privacyAcked: true } });
    const attach = vi.spyOn(store(), 'attach').mockResolvedValue(),
      click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const view = renderNative(<AssistantSurface tripId={101} tripTitle="Fixture" variant="window" />);
    const button = await screen.findByRole('button', { name: 'Attach a booking' });
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    if (!input) return;
    const file = new File(['x'], 'picked.pdf');
    fireEvent.change(input, { target: { files: [file] } });
    expect(attach).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(click).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });
    expect(attach).toHaveBeenCalledOnce();
    expect(input.value).toBe('');
    const field = screen.getByRole('textbox', { name: 'Ask anything about Fixture' });
    const paste = fireEvent.paste(field, { clipboardData: { files: [file] } });
    expect(paste).toBe(false);
    expect(attach).toHaveBeenCalledTimes(2);
  });
  it('clears the former account’s composer draft when the replacement has no draft', async () => {
    seedChat(101, { messages: [answer()], draft: 'Private draft A' });
    useAssistantStore.setState({ status: { ...status(), privacyAcked: true } });
    renderNative(<AssistantSurface tripId={101} tripTitle="Fixture" variant="window" />);
    expect(screen.getByRole('textbox', { name: 'Ask anything about Fixture' })).toHaveValue('Private draft A');
    await act(async () => {
      await switchAccount();
      seed();
    });
    expect(screen.getByRole('textbox', { name: 'Ask anything about Fixture' })).toHaveValue('');
  });
  it.each(['', 'Other trip draft'])('restores the selected trip’s own draft including an empty value: %s', (draft) => {
    seedChat(101, { messages: [answer()], draft: 'Trip A draft' });
    seedChat(102, { draft });
    useAssistantStore.setState({ status: { ...status(), privacyAcked: true } });
    const view = renderNative(<AssistantSurface tripId={101} tripTitle="Fixture" variant="window" />);
    expect(screen.getByRole('textbox', { name: 'Ask anything about Fixture' })).toHaveValue('Trip A draft');
    view.rerender(<AssistantSurface tripId={102} tripTitle="Other" variant="window" />);
    expect(screen.getByRole('textbox', { name: 'Ask anything about Other' })).toHaveValue(draft);
  });
  it.each(['account', 'key', 'selection'] as const)(
    'cannot deliver a pending picker selection into the replacement %s',
    async (end) => {
      useAssistantStore.setState({ status: { ...status(), privacyAcked: true } });
      const original = vi.spyOn(store(), 'attach').mockResolvedValue();
      vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      const view = renderNative(<AssistantSurface tripId={101} tripTitle="Fixture" variant="window" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Attach a booking' }));
      const oldInput = view.container.querySelector<HTMLInputElement>('input[type="file"]');
      expect(oldInput).not.toBeNull();
      if (!oldInput) return;
      if (end === 'account')
        await act(async () => {
          await switchAccount();
          seed();
        });
      else if (end === 'key') view.rerender(<AssistantSurface tripId={102} tripTitle="Other" variant="window" />);
      else act(() => store().newThread(101));
      const current = vi.spyOn(store(), 'attach').mockResolvedValue();
      act(() => useAssistantStore.setState({ attach: current }));
      const next = view.container.querySelector<HTMLInputElement>('input[type="file"]');
      expect(next).not.toBe(oldInput);
      fireEvent.change(oldInput, { target: { files: [new File(['private'], 'old.pdf')] } });
      expect(original).not.toHaveBeenCalled();
      expect(current).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Attach a booking' }));
      if (next) fireEvent.change(next, { target: { files: [new File(['fresh'], 'new.pdf')] } });
      expect(current).toHaveBeenCalledOnce();
    }
  );
});

describe('answer sharing at the actual hook, permission and HTTP boundaries', () => {
  it('posts the exact native preview through the real share HTTP route', async () => {
    let body: unknown;
    server.use(
      http.post('/api/trips/101/assistant/threads/7/messages/msg-700/share', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          message: {
            id: 51,
            trip_id: 101,
            user_id: 1201,
            text: 'Posted',
            reply_to: null,
            created_at: '2026-11-08T04:00:00.000Z',
            deleted: null,
            username: 'fixture',
            avatar: null,
            reply_text: null,
            reply_username: null,
            user_avatar: null,
            avatar_url: null,
            reactions: [],
            attachments: [],
            origin: 'assistant',
          },
        });
      })
    );
    const view = shareHook();
    expect(view.result.current.canShare).toBe(true);
    await act(async () => view.result.current.send());
    expect(body).toEqual({ text: 'Original answer\n\nApplied:\n✓ Add place: Fixture Park' });
    expect(view.result.current.shared).toBe(true);
  });
  it('requires the authoritative message to belong to the selected thread', () => {
    const share = vi.spyOn(assistantRepo, 'share').mockResolvedValue({} as never);
    const view = shareHook(answer('Not stored', 'msg-999'));
    expect(view.result.current.canShare).toBe(false);
    act(() => {
      void view.result.current.send();
    });
    expect(share).not.toHaveBeenCalled();
  });
  it.each(['collab', 'permission', 'owner', 'family'] as const)(
    'rechecks a retained confirmation when %s access changes',
    async (kind) => {
      const share = vi.spyOn(assistantRepo, 'share').mockResolvedValue({} as never),
        view = shareHook(),
        send = view.result.current.send;
      await act(async () => {
        if (kind === 'collab') useAddonStore.setState({ collabChat: false });
        else if (kind === 'permission') usePermissionsStore.setState({ permissions: { collab_edit: 'admin' } });
        else if (kind === 'family') vi.spyOn(familyRuntime, 'isFamilyFrontendActive').mockReturnValue(true);
        else {
          usePermissionsStore.setState({ permissions: { collab_edit: 'trip_owner' } });
          useTripStore.setState({ trip: buildTrip({ id: 101, user_id: 9999 }) });
        }
        await send();
      });
      expect(share).not.toHaveBeenCalled();
    }
  );
  it('retires a retained confirmation when its answer starts writing again', async () => {
    const share = vi.spyOn(assistantRepo, 'share').mockResolvedValue({} as never);
    const stored = answer();
    const view = renderHook(({ writing }) => useAssistantShare(101, stored, writing), {
      initialProps: { writing: false },
      wrapper,
    });
    const send = view.result.current.send;
    view.rerender({ writing: true });
    await act(async () => send());
    expect(share).not.toHaveBeenCalled();
  });
  it('keeps the native offline refusal and sends no share request', async () => {
    const share = vi.spyOn(assistantRepo, 'share').mockResolvedValue({} as never),
      view = shareHook();
    act(() => setForcedOffline(true));
    await act(async () => view.result.current.send());
    expect(share).not.toHaveBeenCalled();
    expect(notifications).toHaveBeenCalledWith('Offline. The assistant needs internet.', 'error', undefined);
  });
  it('coalesces duplicate confirms and reports one current error', async () => {
    const gate = deferred(undefined),
      share = vi.spyOn(assistantRepo, 'share').mockImplementation(async () => {
        await gate.promise;
        throw new Error('refused');
      });
    const view = shareHook(),
      send = view.result.current.send;
    let a!: Promise<void>, b!: Promise<void>;
    act(() => {
      a = observe(send());
      b = observe(send());
    });
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    await act(async () => {
      gate.resolve();
      await Promise.all([a, b]);
    });
    expect(notifications).toHaveBeenCalledTimes(1);
    expect(view.result.current.sending).toBe(false);
  });
  it('never posts the old preview after its changes switch was toggled', async () => {
    const share = vi.spyOn(assistantRepo, 'share').mockResolvedValue({} as never),
      view = shareHook(),
      send = view.result.current.send;
    act(() => view.result.current.toggleChanges());
    await act(async () => send());
    expect(share).not.toHaveBeenCalled();
    await act(async () => view.result.current.send());
    expect(share).toHaveBeenCalledWith(101, 7, 'msg-700', { text: 'Original answer' });
  });
  it.each(['account', 'relogin', 'key', 'selection', 'message', 'permission', 'unmount'] as const)(
    'suppresses issued share success/error effects after %s',
    async (end) => {
      for (const failure of [false, true]) {
        seed();
        const gate = deferred(undefined),
          share = vi.spyOn(assistantRepo, 'share').mockImplementation(async () => {
            await gate.promise;
            if (failure) throw new Error('old');
            return {} as never;
          });
        const view = shareHook();
        let job!: Promise<void>;
        act(() => {
          job = observe(view.result.current.send());
        });
        await waitFor(() => expect(share).toHaveBeenCalledOnce());
        if (end === 'account' || end === 'relogin')
          await act(async () => {
            await switchAccount(end === 'relogin');
            seed();
          });
        else if (end === 'key') view.rerender({ item: answer(), key: 102 });
        else if (end === 'selection') act(() => store().newThread(101));
        else if (end === 'message') {
          const next = answer('Replacement', 'msg-701');
          act(() => seed(next));
          view.rerender({ item: next, key: 101 });
        } else if (end === 'permission')
          act(() => usePermissionsStore.setState({ permissions: { collab_edit: 'admin' } }));
        else view.unmount();
        await act(async () => {
          gate.resolve();
          await job;
        });
        expect(view.result.current.shared).toBe(false);
        expect(notifications).not.toHaveBeenCalled();
        view.unmount();
        share.mockRestore();
        usePermissionsStore.setState({ permissions: {} });
        notifications.mockClear();
      }
    }
  );
  it('does not clear the replacement message’s sending state when an old reply arrives', async () => {
    const a = deferred(undefined),
      b = deferred(undefined);
    vi.spyOn(assistantRepo, 'share')
      .mockImplementationOnce(async () => {
        await a.promise;
        return {} as never;
      })
      .mockImplementationOnce(async () => {
        await b.promise;
        return {} as never;
      });
    const view = shareHook();
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = observe(view.result.current.send());
    });
    const next = answer('Replacement', 'msg-701');
    act(() => seed(next));
    view.rerender({ item: next, key: 101 });
    act(() => {
      second = observe(view.result.current.send());
    });
    await act(async () => {
      a.resolve();
      await first;
    });
    expect(view.result.current.sending).toBe(true);
    expect(view.result.current.shared).toBe(false);
    await act(async () => {
      b.resolve();
      await second;
    });
    expect(view.result.current.shared).toBe(true);
    expect(notifications).toHaveBeenCalledTimes(1);
  });
});

describe('native text and Studio image consent notices', () => {
  it('keeps native text consent and the actual kind/host HTTP payload', async () => {
    useAssistantStore.setState({ status: status() });
    let body: unknown;
    server.use(
      http.post('/api/ai/privacy-ack', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    consent();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(store().status?.privacyAcked).toBe(true));
    expect(body).toEqual({ kind: 'openai', host: 'fixture.invalid' });
  });
  it('sends one text consent request and shows one failure for duplicate clicks', async () => {
    useAssistantStore.setState({ status: status() });
    const gate = deferred(undefined);
    const ack = vi.spyOn(aiConnectionsRepo, 'ackPrivacy').mockImplementation(async () => {
      await gate.promise;
      throw new Error('current');
    });
    consent();
    const button = screen.getByRole('button', { name: 'Got it' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(ack).toHaveBeenCalledOnce();
    await act(async () => gate.resolve());
    expect(notifications).toHaveBeenCalledTimes(1);
  });
  it.each(['account', 'provider', 'unmount'] as const)(
    'suppresses text-consent errors and resets detail state after %s',
    async (end) => {
      useAssistantStore.setState({ status: status() });
      const gate = deferred(undefined);
      vi.spyOn(aiConnectionsRepo, 'ackPrivacy').mockImplementationOnce(async () => {
        await gate.promise;
        throw new Error('old');
      });
      const view = consent();
      fireEvent.click(screen.getByRole('button', { name: 'What gets shared?' }));
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
      if (end === 'account')
        await act(async () => {
          await switchAccount();
          useAssistantStore.setState({ status: status() });
        });
      else if (end === 'provider') act(() => useAssistantStore.setState({ status: status('replacement.invalid') }));
      else view.unmount();
      await act(async () => gate.resolve());
      expect(notifications).not.toHaveBeenCalled();
      if (end !== 'unmount') expect(screen.getByRole('button', { name: 'What gets shared?' })).toBeInTheDocument();
    }
  );
  it('retains expanded text details across unrelated quota updates', () => {
    useAssistantStore.setState({ status: status() });
    consent();
    fireEvent.click(screen.getByRole('button', { name: 'What gets shared?' }));
    act(() => useAssistantStore.setState({ status: { ...status(), quota: { used: 9, limit: 50 } } }));
    expect(screen.queryByRole('button', { name: 'What gets shared?' })).not.toBeInTheDocument();
  });
  it('resets Studio Not now for a new provider and a new Journey, while leaving it text-only', async () => {
    useAssistantStore.setState({
      status: { ...status(), privacyAcked: true, studioImages: true, studioImagesAcked: false },
    });
    const ack = vi.spyOn(aiConnectionsRepo, 'ackPrivacy').mockResolvedValue();
    const view = renderNative(<StudioAssistantPanel assistant={panel()} title="Fixture" />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('button', { name: 'Show it pages' })).toBeNull();
    act(() =>
      useAssistantStore.setState({
        status: { ...status('replacement.invalid'), privacyAcked: true, studioImages: true, studioImagesAcked: false },
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    view.rerender(<StudioAssistantPanel assistant={panel(-302)} title="Next" />);
    expect(screen.getByRole('button', { name: 'Show it pages' })).toBeInTheDocument();
    expect(ack).not.toHaveBeenCalled();
  });
  it('suppresses a pending Studio consent failure after Not now hides the notice', async () => {
    useAssistantStore.setState({
      status: { ...status(), privacyAcked: true, studioImages: true, studioImagesAcked: false },
    });
    const gate = deferred(undefined);
    vi.spyOn(aiConnectionsRepo, 'ackPrivacy').mockImplementation(async () => {
      await gate.promise;
      throw new Error('old');
    });
    renderNative(<StudioAssistantPanel assistant={panel()} title="Fixture" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show it pages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await act(async () => gate.resolve());
    expect(notifications).not.toHaveBeenCalled();
  });
  it('sends native Studio scope once and does not notify a replacement notice about failure', async () => {
    useAssistantStore.setState({
      status: { ...status(), privacyAcked: true, studioImages: true, studioImagesAcked: false },
    });
    const gate = deferred(undefined);
    const ack = vi.spyOn(aiConnectionsRepo, 'ackPrivacy').mockImplementation(async () => {
      await gate.promise;
      throw new Error('old');
    });
    renderNative(<StudioAssistantPanel assistant={panel()} title="Fixture" />);
    const allow = screen.getByRole('button', { name: 'Show it pages' });
    fireEvent.click(allow);
    fireEvent.click(allow);
    expect(ack).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledWith({ kind: 'openai', host: 'fixture.invalid', scope: 'studio_images' });
    act(() =>
      useAssistantStore.setState({
        status: { ...status('replacement.invalid'), privacyAcked: true, studioImages: true, studioImagesAcked: false },
      })
    );
    await act(async () => gate.resolve());
    expect(notifications).not.toHaveBeenCalled();
  });
});
