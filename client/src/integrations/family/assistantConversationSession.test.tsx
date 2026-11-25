import { act, renderHook, waitFor } from '@testing-library/react';
import type { AssistantPageRender, UiStreamChunk } from '@trek/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import {
  chat,
  controlled,
  enable,
  installConversationFixture,
  message,
  response,
  seedChat,
  status,
  store,
  stream,
  summary,
} from '../../../tests/helpers/assistantConversations';
import {
  deferred,
  navigate,
  notifications,
  observe,
  switchAccount,
  wrapper,
} from '../../../tests/helpers/assistantPreferences';
import { server } from '../../../tests/helpers/msw/server';
import { useAssistantRuntime } from '../../components/Assistant/useAssistantRuntime';
import { useAssistantThread } from '../../components/Assistant/useAssistantThread';
import { invalidateOfflineSession } from '../../db/offlineDb';
import { aiConnectionsRepo } from '../../repo/aiConnectionsRepo';
import { assistantRepo } from '../../repo/assistantRepo';
import { OnlineOnlyError } from '../../repo/onlineOnly';
import { useAssistantStore } from '../../store/assistantStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { onPrivateSessionEnd, privateSessionCleanupFailures } from '../../sync/privateSessionEvents';

interface RuntimeCallbacks {
  onNew: (message: { content: readonly { type: 'text'; text: string }[] }) => Promise<void>;
  onCancel: () => Promise<void>;
}
const engine = vi.hoisted(() => ({ current: null as RuntimeCallbacks | null }));
vi.mock('@assistant-ui/react', () => ({
  useExternalStoreRuntime: (options: RuntimeCallbacks) => {
    engine.current = options;
    return options;
  },
}));
const renderRequest: AssistantPageRender = {
  requestId: '5f0c3a52-8d1e-4b7a-9c2f-0a1b2c3d4e5f',
  threadId: 7,
  spreadId: 'sp-1',
  bookVersion: 4,
  hiddenPhotoIds: [],
};
installConversationFixture();
const retire = {
  account: () => switchAccount(),
  relogin: () => switchAccount(true),
  actor: async () => {
    invalidateOfflineSession();
  },
};
const show = (key = 101) => renderHook(({ id }) => useAssistantThread(id), { initialProps: { id: key }, wrapper });

// All model/provider boundaries below are synthetic; no real AI connection is enabled or called.
describe('native conversation readers and selection ownership', () => {
  it.each([101, 0, -301])('keeps the actual native HTTP contract for scope %s', async (key) => {
    const path = key > 0 ? '/api/trips/101/assistant' : key < 0 ? '/api/journeys/301/assistant' : '/api/assistant';
    const hits: string[] = [];
    server.use(
      http.get(path + '/threads', () => {
        hits.push('list');
        return HttpResponse.json({ threads: [summary(9)] });
      }),
      http.get(path + '/threads/9', () => {
        hits.push('detail');
        return HttpResponse.json(response(9, 'Scope ' + key));
      })
    );
    seedChat(key, { threadId: null, messages: [] });
    await store().resume(key);
    expect(hits).toEqual(['list', 'detail']);
    expect(chat(key).messages).toEqual([message('Scope ' + key)]);
  });
  it.each(Object.entries(retire))('drops delayed list success/error after %s', async (_, end) => {
    const pending = deferred([summary()]);
    vi.spyOn(assistantRepo, 'threads').mockImplementationOnce(() => pending.promise);
    const read = observe(store().loadThreads(101));
    await end();
    seedChat(101, { threads: [summary(8, 'Replacement')] });
    pending.resolve();
    await read;
    expect(chat().threads).toEqual([summary(8, 'Replacement')]);
    const failed = deferred(undefined);
    vi.spyOn(assistantRepo, 'threads').mockImplementationOnce(async () => {
      await failed.promise;
      throw new Error('old failure');
    });
    const retry = observe(store().loadThreads(101));
    await end();
    seedChat(101, { threads: [summary(9, 'Newest')] });
    failed.resolve();
    await retry;
    expect(chat().error).toBeNull();
    expect(chat().threads).toEqual([summary(9, 'Newest')]);
  });
  it.each([false, true])('keeps the latest list when an earlier reply fails: %s', async (fails) => {
    const old = deferred([summary(1)]);
    vi.spyOn(assistantRepo, 'threads')
      .mockImplementationOnce(async () => {
        await old.promise;
        if (fails) throw new Error('old');
        return [summary(1)];
      })
      .mockResolvedValueOnce([summary(2)]);
    const first = observe(store().loadThreads(101));
    await store().loadThreads(101);
    old.resolve();
    await first;
    expect(chat().threads).toEqual([summary(2)]);
    expect(chat().error).toBeNull();
  });
  it.each(['success', '404', 'failure'])('fences same-id selection cycles including late %s', async (outcome) => {
    const old = deferred(response());
    vi.spyOn(assistantRepo, 'thread')
      .mockImplementationOnce(async () => {
        await old.promise;
        if (outcome !== 'success') throw { response: { status: outcome === '404' ? 404 : 500 } };
        return response();
      })
      .mockResolvedValueOnce(response(8, 'Eight'))
      .mockResolvedValueOnce(response(7, 'Seven again'));
    const first = observe(store().openThread(101, 7));
    await store().openThread(101, 8);
    await store().openThread(101, 7);
    old.resolve();
    await first;
    expect(chat()).toMatchObject({ threadId: 7, loading: false, error: null, messages: [message('Seven again')] });
  });
  it('does not auto-open a delayed resume after the user chose New chat', async () => {
    seedChat(101, { threadId: null, messages: [] });
    const old = deferred([summary()]);
    vi.spyOn(assistantRepo, 'threads').mockReturnValueOnce(old.promise);
    const detail = vi.spyOn(assistantRepo, 'thread');
    const read = observe(store().resume(101));
    store().newThread(101);
    old.resolve();
    await read;
    expect(detail).not.toHaveBeenCalled();
    expect(chat().threadId).toBeNull();
  });
  it('does not auto-open a delayed resume after the native view unmounts', async () => {
    seedChat(101, { threadId: null, messages: [] });
    const old = deferred([summary()]);
    const list = vi.spyOn(assistantRepo, 'threads').mockReturnValueOnce(old.promise),
      detail = vi.spyOn(assistantRepo, 'thread');
    const view = show();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => old.resolve());
    expect(detail).not.toHaveBeenCalled();
  });
  it('refuses conversation writes while a newly selected thread is still loading', async () => {
    seedChat(101, { loading: true, unsent: 'Retry later' });
    const send = vi.spyOn(assistantRepo, 'send').mockImplementation(async () => stream());
    const attach = vi.spyOn(assistantRepo, 'attach').mockImplementation(async () => stream());
    const decide = vi.spyOn(assistantRepo, 'decide').mockImplementation(async () => stream());
    const undo = vi.spyOn(assistantRepo, 'undo').mockResolvedValue();
    const stop = vi.spyOn(assistantRepo, 'stop').mockResolvedValue();
    const hold = vi.spyOn(assistantRepo, 'takeProposal').mockResolvedValue({ message: message('Held') });
    await store().send(101, 'Question');
    await store().attach(101, new File(['fixture'], 'booking.pdf'));
    await store().decide(101, [{ toolCallId: 'c1', approved: true }]);
    await store().undo(101, 'c1');
    await store().undoBlock(101, ['c1']);
    await store().continueHere(101);
    await store().retry(101);
    await store().takeProposal(101, 'c1');
    expect([send, attach, decide, undo, stop, hold].every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect(chat().messages).toEqual([message()]);
    expect(chat().unsent).toBe('Retry later');
  });
  it('clears a loading indicator on New chat and ignores a delayed 404', async () => {
    const old = deferred(undefined);
    vi.spyOn(assistantRepo, 'thread').mockImplementationOnce(async () => {
      await old.promise;
      throw { response: { status: 404 } };
    });
    const read = observe(store().openThread(101, 7));
    store().newThread(101);
    expect(chat().loading).toBe(false);
    seedChat(101, { threadId: 8 });
    old.resolve();
    await read;
    expect(chat().threadId).toBe(8);
  });
  it('prevents an older list reply from restoring a deleted thread', async () => {
    const old = deferred([summary()]);
    vi.spyOn(assistantRepo, 'threads').mockReturnValueOnce(old.promise);
    vi.spyOn(assistantRepo, 'deleteThread').mockResolvedValueOnce();
    const read = observe(store().loadThreads(101));
    await store().deleteThread(101, 7);
    old.resolve();
    await read;
    expect(chat().threads).toEqual([]);
  });
  it('does not clear a later selection of the same thread when an older delete completes', async () => {
    const old = deferred(undefined);
    vi.spyOn(assistantRepo, 'deleteThread').mockReturnValueOnce(old.promise);
    vi.spyOn(assistantRepo, 'thread').mockResolvedValue(response(7, 'New selection'));
    const remove = observe(store().deleteThread(101, 7));
    store().newThread(101);
    await store().openThread(101, 7);
    old.resolve();
    await remove;
    expect(chat().threadId).toBe(7);
    expect(chat().messages).toEqual([message('New selection')]);
  });
  it('retires retained store commands, draft changes and host cleanup after account replacement', async () => {
    const old = store(),
      host = { render: vi.fn(), flush: vi.fn(async () => true) },
      hold = vi.fn(async () => {});
    const releaseHost = old.hostStudio(-301, host),
      releaseHold = old.holdDecisions(-301, hold);
    await switchAccount();
    seedChat();
    store().hostStudio(-301, host);
    store().holdDecisions(-301, hold);
    const send = vi.spyOn(assistantRepo, 'send').mockImplementation(async () => stream()),
      list = vi.spyOn(assistantRepo, 'threads').mockResolvedValue([]),
      remove = vi.spyOn(assistantRepo, 'deleteThread').mockResolvedValue(),
      undo = vi.spyOn(assistantRepo, 'undo').mockResolvedValue();
    old.setDraft(101, 'private-old');
    old.newThread(101);
    releaseHost();
    releaseHold();
    await old.send(101, 'old');
    await old.loadThreads(101);
    await old.deleteThread(101, 7);
    await old.undo(101, 'c1');
    expect([send, list, remove, undo].every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect(chat().draft).toBe('');
    expect(chat().threadId).toBe(7);
    expect(store().studioHosts[-301]).toBe(host);
    expect(store().decisionHolds[-301]).toEqual([hold]);
  });
});

describe('status policy, ordering and effective connection', () => {
  it('keeps the latest status and ignores the first delayed success', async () => {
    enable('ai_assistant');
    const old = deferred(status('old.invalid'));
    vi.spyOn(aiConnectionsRepo, 'status').mockReturnValueOnce(old.promise).mockResolvedValueOnce(status('new.invalid'));
    const first = observe(store().loadStatus());
    await store().loadStatus();
    old.resolve();
    await first;
    expect(store().status?.effective?.host).toBe('new.invalid');
  });
  it.each(['closed', 'managed', 'off-on'])('does not restore status across policy change %s', async (kind) => {
    enable('ai_assistant');
    const old = deferred(status());
    vi.spyOn(aiConnectionsRepo, 'status').mockReturnValueOnce(old.promise);
    const first = observe(store().loadStatus());
    if (kind === 'managed') useAuthStore.setState({ managed: true });
    else {
      enable();
      if (kind === 'off-on') enable('ai_assistant');
    }
    old.resolve();
    await first;
    expect(store().status).toBeNull();
  });
  it('drops old status errors and privacy acknowledgements after account replacement', async () => {
    enable('ai_assistant');
    useAssistantStore.setState({ status: status() });
    const failure = deferred(undefined),
      ack = deferred(undefined);
    vi.spyOn(aiConnectionsRepo, 'status').mockImplementationOnce(async () => {
      await failure.promise;
      throw new Error('old');
    });
    vi.spyOn(aiConnectionsRepo, 'ackPrivacy').mockReturnValueOnce(ack.promise);
    const read = observe(store().loadStatus()),
      privacy = observe(store().ackPrivacy());
    await switchAccount();
    useAssistantStore.setState({ status: status('replacement.invalid') });
    failure.resolve();
    ack.resolve();
    await Promise.all([read, privacy]);
    expect(store().status).toEqual(status('replacement.invalid'));
  });
  it.each(['ackPrivacy', 'ackStudioImages'] as const)(
    'keeps %s bound to its original effective connection',
    async (name) => {
      useAssistantStore.setState({ status: status() });
      const old = deferred(undefined);
      vi.spyOn(aiConnectionsRepo, 'ackPrivacy').mockReturnValueOnce(old.promise);
      const request = observe(store()[name]());
      useAssistantStore.setState({ status: status('new.invalid') });
      old.resolve();
      await request;
      expect(store().status).toEqual(status('new.invalid'));
    }
  );
  it.each(['ackPrivacy', 'ackStudioImages'] as const)(
    'does not overwrite %s with a GET begun during acknowledgement',
    async (name) => {
      enable('ai_assistant');
      useAssistantStore.setState({ status: status() });
      const ack = deferred(undefined),
        read = deferred(status());
      vi.spyOn(aiConnectionsRepo, 'ackPrivacy').mockReturnValueOnce(ack.promise);
      vi.spyOn(aiConnectionsRepo, 'status').mockReturnValueOnce(read.promise);
      const write = observe(store()[name]()),
        get = observe(store().loadStatus());
      ack.resolve();
      await write;
      read.resolve();
      await get;
      expect(name === 'ackPrivacy' ? store().status?.privacyAcked : store().status?.studioImagesAcked).toBe(true);
    }
  );
  it('allows a fresh different-connection status while an older acknowledgement completes', async () => {
    enable('ai_assistant');
    useAssistantStore.setState({ status: status() });
    const ack = deferred(undefined),
      read = deferred(status('new.invalid'));
    vi.spyOn(aiConnectionsRepo, 'ackPrivacy').mockReturnValueOnce(ack.promise);
    vi.spyOn(aiConnectionsRepo, 'status').mockReturnValueOnce(read.promise);
    const write = observe(store().ackPrivacy());
    useAssistantStore.setState({ status: status('new.invalid') });
    const get = observe(store().loadStatus());
    ack.resolve();
    await write;
    read.resolve();
    await get;
    expect(store().status).toEqual(status('new.invalid'));
  });
  it('still releases Studio/hold registrations after a policy toggle', () => {
    const host = { render: vi.fn(), flush: vi.fn(async () => true) },
      hold = vi.fn(async () => {});
    const releaseHost = store().hostStudio(-301, host),
      releaseHold = store().holdDecisions(-301, hold);
    enable('ai_assistant');
    releaseHost();
    releaseHold();
    expect(store().studioHosts[-301]).toBeUndefined();
    expect(store().decisionHolds[-301]).toEqual([]);
  });
  it('preserves the native offline status and fail-closed server-error behavior', async () => {
    enable('llm_parsing');
    useAssistantStore.setState({ status: status() });
    vi.spyOn(aiConnectionsRepo, 'status')
      .mockRejectedValueOnce(new OnlineOnlyError())
      .mockRejectedValueOnce(new Error('server'));
    await store().loadStatus();
    expect(store().status).toEqual(status());
    await store().loadStatus();
    expect(store().status).toBeNull();
  });
});

describe('streamed turns and deferred tool actions', () => {
  it.each(Object.entries(retire))(
    'clears volatile private state and refuses a late opener after %s',
    async (_, end) => {
      const opener = deferred(undefined);
      let consumed = 0;
      let originalSignal: AbortSignal | undefined;
      vi.spyOn(assistantRepo, 'send').mockImplementationOnce(async (_target, _body, signal) => {
        originalSignal = signal;
        await opener.promise;
        return (async function* () {
          consumed++;
          yield { type: 'data-trek-thread', data: { threadId: 99, title: 'Private A' } } as UiStreamChunk;
        })();
      });
      const turn = observe(store().send(101, 'Private question'));
      await end();
      expect(store().byTrip).toEqual({});
      expect(store().status).toBeNull();
      expect(originalSignal?.aborted).toBe(true);
      seedChat(101, { messages: [message('Replacement')] });
      opener.resolve();
      await turn;
      expect(consumed).toBe(0);
      expect(chat().messages).toEqual([message('Replacement')]);
    }
  );
  it('suppresses all late chunks after cancellation, even when a provider ignores AbortSignal', async () => {
    useAssistantStore.setState({ status: status() });
    const load = vi.spyOn(useSettingsStore.getState(), 'loadSettings');
    const provider = controlled(
      [
        { type: 'start', messageId: 'msg-701' },
        { type: 'text-delta', id: 't', delta: 'Before' },
      ],
      [
        { type: 'text-delta', id: 't', delta: 'AFTER' },
        { type: 'data-trek-quota', data: { used: 49, limit: 50 } },
        {
          type: 'data-trek-applied',
          data: { toolCallId: 'c1', entity: 'memory', ids: [1], dayId: null, undoUntil: null },
        },
        { type: 'data-trek-render-request', data: renderRequest, transient: true },
        { type: 'finish' },
      ]
    );
    const host = { render: vi.fn(), flush: vi.fn(async () => true) };
    store().hostStudio(101, host);
    vi.spyOn(assistantRepo, 'send').mockResolvedValueOnce(provider.generate());
    const turn = observe(store().send(101, 'Question'));
    await waitFor(() => expect(JSON.stringify(chat().messages)).toContain('Before'));
    store().cancel(101);
    provider.gate.resolve();
    await turn;
    expect(JSON.stringify(chat().messages)).not.toContain('AFTER');
    expect(chat().messages[chat().messages.length - 1]?.status).toBe('aborted');
    expect(store().status?.quota).toEqual({ used: 2, limit: 50 });
    expect(store().lastApplied).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(host.render).not.toHaveBeenCalled();
    expect(provider.closed()).toBe(true);
  });
  it('does not let an old animation-frame commit or finalizer overwrite a replacement conversation', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const provider = controlled(
      [
        { type: 'start', messageId: 'msg-701' },
        { type: 'text-delta', id: 't', delta: 'Old' },
      ],
      [{ type: 'finish' }]
    );
    vi.spyOn(assistantRepo, 'send').mockResolvedValueOnce(provider.generate());
    const turn = observe(store().send(101, 'Old'));
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    store().newThread(101);
    seedChat(101, { threadId: 8, messages: [message('New')] });
    frames.forEach((fn) => fn(0));
    provider.gate.resolve();
    await turn;
    expect(chat().messages).toEqual([message('New')]);
    expect(chat().threadId).toBe(8);
  });
  it.each(['cancel', 'newThread', 'account'] as const)(
    'does not send after a Studio flush when retired by %s',
    async (kind) => {
      const flush = deferred(true),
        host = { render: vi.fn(), flush: vi.fn(() => flush.promise) };
      store().hostStudio(-301, host);
      const send = vi.spyOn(assistantRepo, 'send').mockImplementation(async () => stream());
      const turn = observe(store().send(-301, 'Question'));
      await waitFor(() => expect(host.flush).toHaveBeenCalledTimes(1));
      if (kind === 'account') await switchAccount();
      else store()[kind](-301);
      flush.resolve();
      await turn;
      expect(send).not.toHaveBeenCalled();
    }
  );
  it.each(['cancel', 'newThread', 'account'] as const)(
    'does not decide after pending holds when retired by %s',
    async (kind) => {
      const gate = deferred(undefined),
        settle = vi.fn(() => gate.promise);
      store().holdDecisions(101, settle);
      const decide = vi.spyOn(assistantRepo, 'decide').mockImplementation(async () => stream());
      const turn = observe(store().decide(101, [{ toolCallId: 'c1', approved: true }]));
      await waitFor(() => expect(settle).toHaveBeenCalledTimes(1));
      if (kind === 'account') await switchAccount();
      else store()[kind](101);
      gate.resolve();
      await turn;
      expect(decide).not.toHaveBeenCalled();
    }
  );
  it.each([false, true])('does not retry or report a late stop failure (%s) in another selection', async (failure) => {
    const gate = deferred(undefined);
    vi.spyOn(assistantRepo, 'stop').mockImplementationOnce(async () => {
      await gate.promise;
      if (failure) throw new Error('old');
    });
    const send = vi.spyOn(assistantRepo, 'send').mockImplementation(async () => stream());
    const move = observe(store().continueHere(101));
    store().newThread(101);
    seedChat(101, { threadId: 8, unsent: 'Replacement question' });
    gate.resolve();
    await move;
    expect(send).not.toHaveBeenCalled();
    expect(chat().error).toBeNull();
    expect(chat().unsent).toBe('Replacement question');
  });
  it('does not continue an undo block or mark another account’s tool calls', async () => {
    const gate = deferred(undefined),
      undo = vi.spyOn(assistantRepo, 'undo').mockReturnValueOnce(gate.promise).mockResolvedValue();
    const result = observe(store().undoBlock(101, ['c1', 'c2']));
    await switchAccount();
    seedChat();
    gate.resolve();
    await result;
    expect(undo).toHaveBeenCalledTimes(1);
    expect(chat().undone).toEqual({});
  });
  it.each([false, true])('drops held-card replies/errors after selection changes (failure: %s)', async (failure) => {
    const gate = deferred(undefined);
    const hold = vi.spyOn(assistantRepo, 'takeProposal').mockImplementationOnce(async () => {
      await gate.promise;
      if (failure) throw new Error('old');
      return { message: message('Held') };
    });
    const result = observe(store().takeProposal(101, 'c1'));
    await waitFor(() => expect(hold).toHaveBeenCalledTimes(1));
    store().newThread(101);
    seedChat(101, { messages: [message('New')] });
    gate.resolve();
    expect(await result).toBe('skipped');
    expect(chat().messages).toEqual([message('New')]);
    expect(chat().error).toBeNull();
  });
  it('serializes distinct held-card commands so a late full-message response cannot erase a newer choice', async () => {
    const gate = deferred(undefined),
      order: string[] = [];
    vi.spyOn(assistantRepo, 'takeProposal').mockImplementation(async (_trip, _thread, body) => {
      order.push(body.toolCallId);
      if (body.toolCallId === 'c1') await gate.promise;
      return { message: message(body.toolCallId === 'c1' ? 'First' : 'Both') };
    });
    const a = observe(store().takeProposal(101, 'c1')),
      b = observe(store().takeProposal(101, 'c2'));
    await waitFor(() => expect(order).toEqual(['c1']));
    gate.resolve();
    expect(await a).toBe('held');
    expect(await b).toBe('held');
    expect(order).toEqual(['c1', 'c2']);
    expect(chat().messages).toEqual([message('Both')]);
  });
  it('retires a queued card command when its first issued request outlives the account', async () => {
    const gate = deferred(undefined);
    const hold = vi.spyOn(assistantRepo, 'takeProposal').mockImplementation(async () => {
      await gate.promise;
      return { message: message('Held') };
    });
    const a = observe(store().takeProposal(101, 'c1')),
      b = observe(store().takeProposal(101, 'c2'));
    await waitFor(() => expect(hold).toHaveBeenCalledTimes(1));
    await switchAccount();
    gate.resolve();
    await Promise.all([a, b]);
    expect(hold).toHaveBeenCalledTimes(1);
  });
  it('records a failed volatile cleanup and still retires the remaining consumers', () => {
    const before = privateSessionCleanupFailures(),
      reached = vi.fn();
    const bad = onPrivateSessionEnd(() => {
        throw new Error('synthetic cleanup');
      }),
      good = onPrivateSessionEnd(reached);
    try {
      invalidateOfflineSession();
      expect(reached).toHaveBeenCalledOnce();
      expect(privateSessionCleanupFailures()).toBe(before + 1);
    } finally {
      bad();
      good();
    }
  });
  it('does not send after the original Studio host is replaced during its flush', async () => {
    const gate = deferred(true),
      first = { render: vi.fn(), flush: vi.fn(() => gate.promise) },
      second = { render: vi.fn(), flush: vi.fn(async () => true) };
    store().hostStudio(-301, first);
    const send = vi.spyOn(assistantRepo, 'send').mockImplementation(async () => stream());
    const turn = observe(store().send(-301, 'Original host'));
    await waitFor(() => expect(first.flush).toHaveBeenCalledOnce());
    store().hostStudio(-301, second);
    gate.resolve();
    await turn;
    expect(send).not.toHaveBeenCalled();
  });
  it('does not forward an old render request to a replacement Studio host', async () => {
    const first = { render: vi.fn(), flush: vi.fn(async () => true) },
      second = { render: vi.fn(), flush: vi.fn(async () => true) };
    store().hostStudio(-301, first);
    const provider = controlled(
      [{ type: 'start', messageId: 'msg-701' }],
      [{ type: 'data-trek-render-request', data: renderRequest, transient: true }, { type: 'finish' }]
    );
    vi.spyOn(assistantRepo, 'send').mockResolvedValueOnce(provider.generate());
    const turn = observe(store().send(-301, 'Original host'));
    await waitFor(() => expect(chat(-301).isRunning).toBe(true));
    store().hostStudio(-301, second);
    provider.gate.resolve();
    await turn;
    expect(first.render).not.toHaveBeenCalled();
    expect(second.render).not.toHaveBeenCalled();
  });
  it('keeps a replacement connection’s quota when an older stream reports usage', async () => {
    useAssistantStore.setState({ status: status() });
    const provider = controlled(
      [
        { type: 'start', messageId: 'msg-701' },
        { type: 'text-delta', id: 't', delta: 'Reply from the original connection' },
      ],
      [{ type: 'data-trek-quota', data: { used: 49, limit: 50 } }, { type: 'finish' }]
    );
    vi.spyOn(assistantRepo, 'send').mockResolvedValueOnce(provider.generate());
    const turn = observe(store().send(101, 'Original connection'));
    await waitFor(() => expect(JSON.stringify(chat().messages)).toContain('Reply from the original connection'));
    const replacement = { ...status('replacement.invalid'), quota: { used: 42, limit: 50 } };
    useAssistantStore.setState({ status: replacement });
    provider.gate.resolve();
    await turn;
    expect(provider.closed()).toBe(true);
    expect(store().status).toEqual(replacement);
  });
  it('ends renderer signals after a normally completed turn too', async () => {
    const send = vi.spyOn(assistantRepo, 'send').mockImplementation(async () => stream());
    await store().send(101, 'Question');
    expect(send.mock.calls[0][2].aborted).toBe(true);
    expect(chat().isRunning).toBe(false);
    expect(chat().error).toBeNull();
  });
});

describe('native header and external-runtime callbacks', () => {
  it.each(['account', 'relogin', 'unmount', 'key'] as const)(
    'retires retained native header actions after %s',
    async (end) => {
      const view = show();
      await waitFor(() => expect(view.result.current.threadId).toBe(7));
      const old = view.result.current;
      if (end === 'account' || end === 'relogin') await act(async () => switchAccount(end === 'relogin'));
      else if (end === 'unmount') view.unmount();
      else view.rerender({ id: 102 });
      seedChat(101);
      const list = vi.spyOn(assistantRepo, 'threads').mockResolvedValue([]),
        detail = vi.spyOn(assistantRepo, 'thread').mockResolvedValue(response()),
        remove = vi.spyOn(assistantRepo, 'deleteThread').mockResolvedValue();
      await act(async () => {
        old.refreshThreads();
        old.openThread(7);
        old.newThread();
        old.stop();
        await old.removeThread();
      });
      expect([list, detail, remove].every((fn) => fn.mock.calls.length === 0)).toBe(true);
      expect(chat().threadId).toBe(7);
    }
  );
  it('suppresses an old native delete error toast after account replacement', async () => {
    const view = show(),
      gate = deferred(undefined);
    vi.spyOn(assistantRepo, 'deleteThread').mockImplementationOnce(async () => {
      await gate.promise;
      throw new Error('old');
    });
    let remove!: Promise<void>;
    act(() => {
      remove = observe(view.result.current.removeThread());
    });
    await act(async () => switchAccount());
    await act(async () => {
      gate.resolve();
      await remove;
    });
    expect(notifications).not.toHaveBeenCalled();
  });
  it('does not cancel a successor view’s running turn from an older view’s cleanup', async () => {
    const first = show(),
      second = show();
    const provider = controlled([{ type: 'start', messageId: 'msg-701' }], [{ type: 'finish' }]);
    vi.spyOn(assistantRepo, 'send').mockResolvedValueOnce(provider.generate());
    let turn!: Promise<void>;
    act(() => {
      turn = observe(store().send(101, 'New view'));
    });
    await waitFor(() => expect(chat().isRunning).toBe(true));
    first.unmount();
    expect(chat().abort?.signal.aborted).toBe(false);
    await act(async () => {
      provider.gate.resolve();
      await turn;
    });
    second.unmount();
  });
  it('keeps a turn already running when its native panel mounts', async () => {
    const provider = controlled([{ type: 'start', messageId: 'msg-701' }], [{ type: 'finish' }]);
    const send = vi.spyOn(assistantRepo, 'send').mockResolvedValueOnce(provider.generate());
    const turn = observe(store().send(101, 'Opened with question'));
    await waitFor(() => expect(chat().isRunning).toBe(true));
    const view = show();
    expect(send.mock.calls[0][2].aborted).toBe(false);
    expect(chat().isRunning).toBe(true);
    await act(async () => {
      provider.gate.resolve();
      await turn;
    });
    view.unmount();
  });
  it('keeps a shared turn when the newer view closes and retires it only on the final close', async () => {
    const first = show(),
      second = show();
    const provider = controlled([{ type: 'start', messageId: 'msg-701' }], [{ type: 'finish' }]);
    const send = vi.spyOn(assistantRepo, 'send').mockResolvedValueOnce(provider.generate());
    let turn!: Promise<void>;
    act(() => {
      turn = observe(store().send(101, 'Shared'));
    });
    await waitFor(() => expect(chat().isRunning).toBe(true));
    second.unmount();
    expect(send.mock.calls[0][2].aborted).toBe(false);
    first.unmount();
    expect(send.mock.calls[0][2].aborted).toBe(true);
    await act(async () => {
      provider.gate.resolve();
      await turn;
    });
  });
  it('still stops its active turn on unmount after policy off/on', async () => {
    enable('ai_assistant');
    const view = show();
    act(() => {
      enable();
      enable('ai_assistant');
    });
    const provider = controlled([{ type: 'start', messageId: 'msg-701' }], [{ type: 'finish' }]);
    const send = vi.spyOn(assistantRepo, 'send').mockResolvedValueOnce(provider.generate());
    let turn!: Promise<void>;
    act(() => {
      turn = observe(store().send(101, 'After policy change'));
    });
    await waitFor(() => expect(chat().isRunning).toBe(true));
    view.unmount();
    expect(send.mock.calls[0][2].aborted).toBe(true);
    await act(async () => {
      provider.gate.resolve();
      await turn;
    });
  });
  it.each([0, -301])('does not retire scope %s when the unrelated planner trip changes', async (key) => {
    const view = show(key),
      list = vi.spyOn(assistantRepo, 'threads');
    await act(async () => navigate());
    expect(list).not.toHaveBeenCalled();
    expect(view.result.current.threadId).toBeNull();
  });
  it.each(['account', 'unmount', 'key'] as const)(
    'fences the actual external-runtime composer after %s',
    async (end) => {
      const view = renderHook(({ id }) => useAssistantRuntime(id), { initialProps: { id: 101 }, wrapper });
      const old = engine.current;
      expect(old).not.toBeNull();
      if (end === 'account') await act(async () => switchAccount());
      else if (end === 'unmount') view.unmount();
      else view.rerender({ id: 102 });
      const send = vi.spyOn(assistantRepo, 'send').mockImplementation(async () => stream());
      await act(async () => {
        await old?.onNew({ content: [{ type: 'text', text: 'Private old question' }] });
        await old?.onCancel();
      });
      expect(send).not.toHaveBeenCalled();
    }
  );
  it('does not stop a newer turn through an older composer cancellation callback', async () => {
    renderHook(() => useAssistantRuntime(101), { wrapper });
    const old = engine.current;
    const provider = controlled([{ type: 'start', messageId: 'msg-701' }], [{ type: 'finish' }]);
    vi.spyOn(assistantRepo, 'send').mockResolvedValueOnce(provider.generate());
    const turn = observe(store().send(101, 'New question'));
    await waitFor(() => expect(chat().isRunning).toBe(true));
    await old?.onCancel();
    expect(chat().abort?.signal.aborted).toBe(false);
    provider.gate.resolve();
    await turn;
  });
});
