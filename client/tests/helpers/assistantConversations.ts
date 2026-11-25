import type { AiStatusResponse, AssistantMessage, UiStreamChunk } from '@trek/shared';
import { http, HttpResponse } from 'msw';
import { beforeEach } from 'vitest';
import { useAddonStore } from '../../src/store/addonStore';
import { chatOf, useAssistantStore, type AssistantTripChat } from '../../src/store/assistantStore';
import { deferred, installPreferencesFixture } from './assistantPreferences';
import { server } from './msw/server';
import { seedStore } from './store';

export const store = () => useAssistantStore.getState();
export const chat = (key = 101) => chatOf(store(), key);
export const message = (
  text = 'Original answer',
  id = 'msg-700',
  role: 'assistant' | 'user' = 'assistant'
): AssistantMessage => ({
  id,
  role,
  status: 'complete',
  createdAt: '2026-11-08T04:00:00.000Z',
  parts: [{ type: 'text', text }],
});
export const summary = (id = 7, title = 'Original thread') => ({
  id,
  title,
  lastMessageAt: '2026-11-08T04:00:00.000Z',
});
export const response = (id = 7, text = 'Original answer') => ({ thread: summary(id), messages: [message(text)] });
export function seedChat(key = 101, patch: Partial<AssistantTripChat> = {}) {
  useAssistantStore.setState((s) => ({
    byTrip: {
      ...s.byTrip,
      [key]: { ...chatOf({ byTrip: {} }, key), threadId: 7, messages: [message()], threads: [summary()], ...patch },
    },
  }));
}
export function status(host = 'fixture.invalid'): AiStatusResponse {
  return {
    available: true,
    policy: 'instance',
    canConnectOwn: false,
    effective: { source: 'instance', kind: 'openai', model: 'fixture', host, paidBy: 'instance' },
    own: null,
    instance: { kind: 'openai', model: 'fixture', host },
    quota: { used: 2, limit: 50 },
    privacyAcked: false,
    retention: { mode: 'days', days: 90 },
    openrouterOAuth: false,
  };
}
export function enable(...ids: string[]) {
  seedStore(useAddonStore, { loaded: true, addons: ids.map((id) => ({ id, enabled: true })) });
}
export async function* stream(chunks: UiStreamChunk[] = [{ type: 'finish' }]): AsyncGenerator<UiStreamChunk> {
  yield* chunks;
}
/** Deliberately ignores AbortSignal to prove late providers cannot write through a retired owner. */
export function controlled(first: UiStreamChunk[], later: UiStreamChunk[]) {
  const gate = deferred(undefined);
  let closed = false;
  async function* generate(): AsyncGenerator<UiStreamChunk> {
    try {
      yield* first;
      await gate.promise;
      yield* later;
    } finally {
      closed = true;
    }
  }
  return { gate, generate, closed: () => closed };
}
export function installConversationFixture() {
  installPreferencesFixture();
  beforeEach(() => {
    server.use(
      http.get(/\/api\/(?:trips\/\d+\/|journeys\/\d+\/)?assistant\/threads$/, () => HttpResponse.json({ threads: [] })),
      http.get(/\/api\/(?:trips\/\d+\/|journeys\/\d+\/)?assistant\/threads\/\d+$/, ({ request }) =>
        HttpResponse.json(response(Number(new URL(request.url).pathname.split('/').slice(-1)[0])))
      )
    );
    seedChat();
  });
}
