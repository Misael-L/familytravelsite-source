import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { AiStatusResponse } from '@trek/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import {
  deferred,
  installPreferencesFixture,
  navigate,
  notifications,
  observe,
  seed,
  switchAccount,
  wrapper,
} from '../../../tests/helpers/assistantPreferences';
import { server } from '../../../tests/helpers/msw/server';
import { settingsApi } from '../../api/client';
import AssistantMemoryDialog from '../../components/Assistant/AssistantMemoryDialog';
import AssistantRemembered from '../../components/Assistant/AssistantRemembered';
import { AssistantViewContext } from '../../components/Assistant/assistantViewContext';
import { useAssistantHints, useAssistantHintsSetting } from '../../components/Assistant/useAssistantHints';
import { useAssistantMemoryEditor } from '../../components/Assistant/useAssistantMemoryEditor';
import { MAX_MEMORY_CHARS, useTripMemory } from '../../components/Assistant/useTripMemory';
import { useAssistantHintsStore } from '../../store/assistantHintsStore';
import { useAssistantStore } from '../../store/assistantStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { setForcedOffline } from '../../sync/networkMode';

installPreferencesFixture();
function memory(tripId = 101) {
  return renderHook(() => useTripMemory(tripId), { wrapper });
}
function setNotes(notes: Record<string, string>) {
  useSettingsStore.setState((s) => ({ settings: { ...s.settings, assistant_memory: notes } }));
}
function available() {
  useAssistantStore.setState({ status: { available: true } as AiStatusResponse });
}
function hints() {
  available();
  return renderHook(() => useAssistantHints(101, { withStays: false }), { wrapper });
}
function holdSave(fail = false) {
  const reply = deferred(undefined);
  const put = vi.fn(async () => {
    await reply.promise;
    return fail ? HttpResponse.json({ error: 'refused' }, { status: 403 }) : HttpResponse.json({ success: true });
  });
  server.use(http.put('/api/settings', put));
  return { reply, put };
}
const retire = {
  account: () => switchAccount(),
  relogin: () => switchAccount(true),
  trip: async () => {
    navigate();
  },
};

describe('account-owned assistant hint marks', () => {
  it('isolates equal trip ids and restores only the returning account’s saved marks', async () => {
    useAssistantHintsStore.getState().dismiss(101, 'private-a');
    await act(async () => switchAccount());
    expect(useAssistantHintsStore.getState().byTrip).toEqual({});
    useAssistantHintsStore.getState().load(101);
    expect(useAssistantHintsStore.getState().byTrip[101].dismissed).toEqual([]);
    useAssistantHintsStore.getState().markSeen(101, ['private-b']);
    await act(async () => switchAccount(true)); // B -> A
    useAssistantHintsStore.getState().load(101);
    expect(useAssistantHintsStore.getState().byTrip[101]).toEqual({ dismissed: ['private-a'], seen: [] });
    expect(Object.keys(localStorage).filter((k) => k.startsWith('trek:assistant-hints:v2:'))).toHaveLength(2);
  });
  it('does not assign an unowned legacy key to whoever signs in next', () => {
    localStorage.setItem('trek:assistant-hints:101', JSON.stringify({ dismissed: ['private-legacy'], seen: [] }));
    useAssistantHintsStore.getState().load(101);
    expect(useAssistantHintsStore.getState().byTrip[101]).toEqual({ dismissed: [], seen: [] });
    expect(localStorage.getItem('trek:assistant-hints:101')).toContain('private-legacy');
  });
  it('keeps anonymous marks in memory only and clears private state at logout', async () => {
    useAssistantHintsStore.getState().dismiss(101, 'signed-in');
    setForcedOffline(true);
    await useAuthStore.getState().logout();
    expect(useAssistantHintsStore.getState().byTrip).toEqual({});
    const before = Object.keys(localStorage).filter((k) => k.startsWith('trek:assistant-hints:'));
    useAssistantHintsStore.getState().markSeen(101, ['anonymous']);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('trek:assistant-hints:'))).toEqual(before);
  });
  it.each(Object.entries(retire))('retires rendered hint handlers after %s', async (_, end) => {
    const send = vi.spyOn(useAssistantStore.getState(), 'send').mockResolvedValue();
    const focus = vi.spyOn(useAssistantStore.getState(), 'setFocus');
    const view = hints(),
      old = view.result.current;
    expect(old.hints).toHaveLength(1);
    await act(async () => end());
    act(() => {
      old.dismiss(old.hints[0].id);
      old.markWarnsSeen();
      old.ask(old.hints[0]);
    });
    expect(send).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(Object.keys(localStorage).filter((k) => k.startsWith('trek:assistant-hints:'))).toEqual([]);
  });
  it('retires hint callbacks on unmount', () => {
    const send = vi.spyOn(useAssistantStore.getState(), 'send').mockResolvedValue();
    const view = hints(),
      old = view.result.current;
    view.unmount();
    act(() => {
      old.ask(old.hints[0]);
      old.dismiss(old.hints[0].id);
      old.markWarnsSeen();
    });
    expect(send).not.toHaveBeenCalled();
    expect(useAssistantHintsStore.getState().byTrip[101].dismissed).toEqual([]);
  });
  it('rechecks the native availability gate before asking', () => {
    const send = vi.spyOn(useAssistantStore.getState(), 'send').mockResolvedValue();
    const view = hints(),
      old = view.result.current;
    act(() => useAssistantStore.setState({ status: null }));
    act(() => old.ask(old.hints[0]));
    expect(send).not.toHaveBeenCalled();
  });
});

describe('trip memory writes through the native settings contract', () => {
  it('merges from current settings, trims/caps notes and deletes only the requested trip', async () => {
    setNotes({ '101': 'before', '102': 'other' });
    const view = memory(),
      retainedSave = view.result.current.save;
    act(() => setNotes({ '101': 'before', '102': 'updated elsewhere', '103': 'new' }));
    const put = vi.spyOn(settingsApi, 'set');
    await act(async () => expect(await retainedSave('  ' + 'x'.repeat(MAX_MEMORY_CHARS + 20) + ' ')).toBe(true));
    expect(put).toHaveBeenLastCalledWith('assistant_memory', {
      '101': 'x'.repeat(MAX_MEMORY_CHARS),
      '102': 'updated elsewhere',
      '103': 'new',
    });
    await act(async () => expect(await view.result.current.save('  ')).toBe(true));
    expect(put).toHaveBeenLastCalledWith('assistant_memory', { '102': 'updated elsewhere', '103': 'new' });
  });
  it('serializes separate trip editors and distinct saves without losing another trip', async () => {
    const gate = holdSave(),
      put = vi.spyOn(settingsApi, 'set');
    const a = memory(),
      b = memory(102);
    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => {
      first = observe(a.result.current.save('first'));
      second = observe(b.result.current.save('second'));
    });
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    await act(async () => {
      gate.reply.resolve();
      await Promise.all([first, second]);
    });
    expect(put.mock.calls.map((x) => x[1])).toEqual([{ '101': 'first' }, { '101': 'first', '102': 'second' }]);
  });
  it.each(Object.entries(retire))('suppresses an issued save’s completion and queued work after %s', async (_, end) => {
    const gate = holdSave();
    const view = memory();
    let first!: Promise<boolean>, queued!: Promise<boolean>;
    act(() => {
      first = observe(view.result.current.save('issued'));
      queued = observe(view.result.current.save('queued'));
    });
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    await act(async () => end());
    await act(async () => {
      gate.reply.resolve();
      expect(await first).toBe(false);
      expect(await queued).toBe(false);
    });
    expect(gate.put).toHaveBeenCalledTimes(1);
    expect(notifications).not.toHaveBeenCalled();
  });
  it.each(['account', 'unmount'] as const)('refuses a retained save before dispatch after %s', async (end) => {
    const put = vi.spyOn(settingsApi, 'set');
    const view = memory(),
      save = view.result.current.save;
    if (end === 'account') await act(async () => switchAccount());
    else view.unmount();
    await act(async () => expect(await save('private-old')).toBe(false));
    expect(put).not.toHaveBeenCalled();
    expect(notifications).not.toHaveBeenCalled();
  });
  it('does not block a new account behind an old in-flight save', async () => {
    const gate = holdSave(),
      a = memory();
    let first!: Promise<boolean>;
    act(() => {
      first = observe(a.result.current.save('private-a'));
    });
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    await act(async () => switchAccount());
    server.use(http.put('/api/settings', () => HttpResponse.json({ success: true })));
    const b = memory();
    await act(async () => expect(await b.result.current.save('private-b')).toBe(true));
    await act(async () => {
      gate.reply.resolve();
      await first;
    });
    expect(useSettingsStore.getState().settings.assistant_memory).toEqual({ '101': 'private-b' });
    expect(notifications).toHaveBeenCalledTimes(1);
  });
  it('loads the complete map before editing a previously unloaded preference', async () => {
    useSettingsStore.setState({ isLoaded: false });
    server.use(
      http.get('/api/settings', () => HttpResponse.json({ settings: { assistant_memory: { '102': 'must survive' } } }))
    );
    const view = memory();
    await act(async () => expect(await view.result.current.save('new')).toBe(true));
    expect(useSettingsStore.getState().settings.assistant_memory).toEqual({ '101': 'new', '102': 'must survive' });
  });
  it('refuses a memory write if existing settings cannot be loaded', async () => {
    useSettingsStore.setState({ isLoaded: false });
    server.use(http.get('/api/settings', () => HttpResponse.json({ error: 'offline' }, { status: 503 })));
    const put = vi.spyOn(settingsApi, 'set'),
      view = memory();
    await act(async () => expect(await view.result.current.save('unsafe partial map')).toBe(false));
    expect(put).not.toHaveBeenCalled();
    expect(notifications).toHaveBeenCalledWith('Error saving setting', 'error', undefined);
  });
  it('rolls back a refused optimistic note without losing other trip notes', async () => {
    setNotes({ '101': 'saved', '102': 'other' });
    const gate = holdSave(true),
      view = memory();
    let job!: Promise<boolean>;
    act(() => {
      job = observe(view.result.current.save('refused'));
    });
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    await act(async () => {
      gate.reply.resolve();
      expect(await job).toBe(false);
    });
    expect(useSettingsStore.getState().settings.assistant_memory).toEqual({ '101': 'saved', '102': 'other' });
    expect(notifications.mock.calls[0][1]).toBe('error');
  });
  it('does not roll back newer server memory on an older write failure', async () => {
    const gate = holdSave(true),
      view = memory();
    let job!: Promise<boolean>;
    act(() => {
      job = observe(view.result.current.save('refused'));
    });
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    act(() => setNotes({ '101': 'newer server note' }));
    await act(async () => {
      gate.reply.resolve();
      await job;
    });
    expect(useSettingsStore.getState().settings.assistant_memory).toEqual({ '101': 'newer server note' });
  });
  it.each([false, true])(
    'protects a GET started during an unsettled save (reply before completion: %s)',
    async (early) => {
      const gate = holdSave(),
        view = memory();
      let save!: Promise<boolean>;
      act(() => {
        save = observe(view.result.current.save('new'));
      });
      await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
      const reply = deferred(undefined),
        get = vi.fn(async () => {
          await reply.promise;
          return HttpResponse.json({ settings: { assistant_memory: { '101': 'old' }, language: 'fr' } });
        });
      server.use(http.get('/api/settings', get));
      const read = observe(useSettingsStore.getState().loadSettings());
      await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
      await act(async () => {
        if (early) {
          reply.resolve();
          await read;
          gate.reply.resolve();
          await save;
        } else {
          gate.reply.resolve();
          await save;
          reply.resolve();
          await read;
        }
      });
      expect(useSettingsStore.getState().settings).toMatchObject({
        assistant_memory: { '101': 'new' },
        language: 'fr',
      });
    }
  );
  it('settles a failed command before constructing the next queued map', async () => {
    setNotes({ '102': 'other' });
    const reply = deferred(undefined);
    let calls = 0;
    server.use(
      http.put('/api/settings', async () => {
        calls++;
        if (calls === 1) {
          await reply.promise;
          return HttpResponse.json({ error: 'refused' }, { status: 403 });
        }
        return HttpResponse.json({ success: true });
      })
    );
    const view = memory();
    let first!: Promise<boolean>, next!: Promise<boolean>;
    act(() => {
      first = observe(view.result.current.save('refused'));
      next = observe(view.result.current.save('accepted'));
    });
    await waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      reply.resolve();
      expect(await first).toBe(false);
      expect(await next).toBe(true);
    });
    expect(useSettingsStore.getState().settings.assistant_memory).toEqual({ '101': 'accepted', '102': 'other' });
  });
  it('does not let the former account’s outstanding write suppress a fresh account’s read', async () => {
    const gate = holdSave(),
      view = memory();
    let save!: Promise<boolean>;
    act(() => {
      save = observe(view.result.current.save('private-a'));
    });
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    await act(async () => switchAccount());
    server.use(
      http.get('/api/settings', () => HttpResponse.json({ settings: { assistant_memory: { '101': 'private-b' } } }))
    );
    await act(async () => useSettingsStore.getState().loadSettings());
    expect(useSettingsStore.getState().settings.assistant_memory).toEqual({ '101': 'private-b' });
    await act(async () => {
      gate.reply.resolve();
      await save;
    });
    expect(useSettingsStore.getState().settings.assistant_memory).toEqual({ '101': 'private-b' });
  });
  it('also protects assistant preferences edited through the existing bulk-settings endpoint', async () => {
    const reply = deferred(undefined);
    server.use(
      http.get('/api/settings', async () => {
        await reply.promise;
        return HttpResponse.json({ settings: { assistant_hints: true } });
      }),
      http.post('/api/settings/bulk', () => HttpResponse.json({ success: true }))
    );
    const read = observe(useSettingsStore.getState().loadSettings());
    await act(async () => useSettingsStore.getState().updateSettings({ assistant_hints: false }));
    await act(async () => {
      reply.resolve();
      await read;
    });
    expect(useSettingsStore.getState().settings.assistant_hints).toBe(false);
  });
  it('accepts unrelated settings from an older GET without undoing either assistant preference', async () => {
    const reply = deferred({ settings: { language: 'fr', assistant_memory: { '101': 'old' }, assistant_hints: true } });
    server.use(http.get('/api/settings', async () => HttpResponse.json(await reply.promise)));
    const read = observe(useSettingsStore.getState().loadSettings()),
      view = memory();
    await act(async () => {
      await view.result.current.save('new');
      await useSettingsStore.getState().updateSetting('assistant_hints', false);
    });
    await act(async () => {
      reply.resolve({ settings: { language: 'fr', assistant_memory: { '101': 'old' }, assistant_hints: true } });
      await read;
    });
    expect(useSettingsStore.getState().settings).toMatchObject({
      language: 'fr',
      assistant_memory: { '101': 'new' },
      assistant_hints: false,
    });
  });
});

describe('native hint toggle and memory dialog lifetimes', () => {
  it('orders rapid toggles against the latest value', async () => {
    const gate = holdSave(),
      put = vi.spyOn(settingsApi, 'set');
    const view = renderHook(() => useAssistantHintsSetting(), { wrapper });
    act(() => {
      view.result.current.toggle();
      view.result.current.toggle();
    });
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    await act(async () => gate.reply.resolve());
    await waitFor(() => expect(put.mock.calls.map((x) => x[1])).toEqual([false, true]));
  });
  it('retires a toggle callback and its failed reply on logout', async () => {
    const gate = holdSave(true),
      view = renderHook(() => useAssistantHintsSetting(), { wrapper });
    const toggle = view.result.current.toggle;
    act(toggle);
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    await act(async () => switchAccount());
    act(toggle);
    await act(async () => gate.reply.resolve());
    expect(gate.put).toHaveBeenCalledTimes(1);
    expect(notifications).not.toHaveBeenCalled();
  });
  it('uses the actual dialog, saves once for a double click, and closes only after success', async () => {
    setNotes({ '101': 'saved note' });
    const gate = holdSave(),
      close = vi.fn();
    render(<AssistantMemoryDialog tripId={101} onClose={close} />, { wrapper });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'updated note' } });
    const save = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    expect(close).not.toHaveBeenCalled();
    await act(async () => gate.reply.resolve());
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(useSettingsStore.getState().settings.assistant_memory).toEqual({ '101': 'updated note' });
  });
  it.each(['account', 'trip', 'unmount'] as const)('does not close a replacement editor after %s', async (end) => {
    setNotes({ '101': 'saved note' });
    const gate = holdSave(),
      close = vi.fn();
    const view = render(<AssistantMemoryDialog tripId={101} onClose={close} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    if (end === 'account') await act(async () => switchAccount());
    else if (end === 'trip') {
      act(navigate);
      view.rerender(<AssistantMemoryDialog tripId={102} onClose={close} />);
    } else view.unmount();
    await act(async () => gate.reply.resolve());
    expect(close).not.toHaveBeenCalled();
    expect(notifications).not.toHaveBeenCalled();
  });
  it('retains a refused dialog draft and allows a later explicit retry', async () => {
    setNotes({ '101': 'saved note' });
    const gate = holdSave(true),
      close = vi.fn();
    const view = renderHook(() => useAssistantMemoryEditor(101, close), { wrapper });
    act(() => view.result.current.setDraft('draft'));
    let job!: Promise<void>;
    act(() => {
      job = observe(view.result.current.save());
    });
    await waitFor(() => expect(gate.put).toHaveBeenCalledTimes(1));
    await act(async () => {
      gate.reply.resolve();
      await job;
    });
    expect(view.result.current.draft).toBe('draft');
    expect(view.result.current.saving).toBe(false);
    expect(close).not.toHaveBeenCalled();
    server.use(http.put('/api/settings', () => HttpResponse.json({ success: true })));
    await act(async () => view.result.current.save());
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('loads an untouched dialog before saving so it cannot erase unseen notes', async () => {
    useSettingsStore.setState({ isLoaded: false });
    const reply = deferred(undefined);
    server.use(
      http.get('/api/settings', async () => {
        await reply.promise;
        return HttpResponse.json({ settings: { assistant_memory: { '101': 'arrived late' } } });
      })
    );
    const close = vi.fn();
    render(<AssistantMemoryDialog tripId={101} onClose={close} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await act(async () => reply.resolve());
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(useSettingsStore.getState().settings.assistant_memory).toEqual({ '101': 'arrived late' });
  });
  it('resets the remembered-note edit affordance when its trip changes', () => {
    const element = (tripId: number) => (
      <AssistantViewContext.Provider value={{ tripId, variant: 'window', density: 'compact' }}>
        <AssistantRemembered note="Remembered" live={false} />
      </AssistantViewContext.Provider>
    );
    const view = render(element(101), { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Edit trip notes' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(navigate);
    view.rerender(element(102));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    seed();
  });
});
