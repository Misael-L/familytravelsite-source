import type { AssistantErrorCode, AssistantThreadSummary } from '@trek/shared';
import { assistantRepo } from '../repo/assistantRepo';
import { assistantTargetOf } from './assistantChatKey';
import type { AssistantContext, AssistantTripChat } from './assistantStore';

interface ThreadPort {
  chat: (key: number) => AssistantTripChat;
  patch: (key: number, value: Partial<AssistantTripChat>) => void;
  clearRoute: () => void;
  error: (value: unknown) => AssistantErrorCode;
  status: (value: unknown) => number | undefined;
}

/** Latest list/selection wins, including errors and same-id selection cycles. */
export function assistantThreadActions(ctx: AssistantContext, port: ThreadPort) {
  const load = async (key: number): Promise<boolean> => {
    const owner = ctx.ownership.readList(key);
    try {
      const threads = await assistantRepo.threads(assistantTargetOf(key));
      if (!owner.current()) return false;
      port.patch(key, { threads });
      return true;
    } catch (error) {
      if (owner.current()) port.patch(key, { error: port.error(error) });
      return false;
    }
  };
  const openThread = async (key: number, threadId: number) => {
    if (port.chat(key).isRunning) return;
    const owner = ctx.ownership.replaceChat(key);
    port.clearRoute();
    port.patch(key, { threadId, loading: true, error: null, unsent: null });
    try {
      const { messages } = await assistantRepo.thread(assistantTargetOf(key), threadId);
      if (owner.current()) port.patch(key, { messages, loading: false });
    } catch (error) {
      if (!owner.current()) return;
      if (port.status(error) !== 404) {
        port.patch(key, { loading: false, error: port.error(error) });
        return;
      }
      const threads = port.chat(key).threads;
      port.patch(key, { threadId: null, messages: [], loading: false, threads: without(threads, threadId) });
    }
  };
  const newThread = (key: number) => {
    ctx.ownership.replaceChat(key);
    port.chat(key).abort?.abort();
    port.clearRoute();
    port.patch(key, {
      threadId: null,
      messages: [],
      isRunning: false,
      loading: false,
      error: null,
      unsent: null,
      abort: null,
      live: { activity: null },
      compare: null,
    });
  };
  const remove = async (key: number, threadId: number) => {
    const owner = ctx.ownership.captureOwner(),
      selection = ctx.ownership.captureChat(key);
    ctx.ownership.changeList(key);
    try {
      await assistantRepo.deleteThread(assistantTargetOf(key), threadId);
    } catch (error) {
      if (owner.current()) throw error;
      return;
    }
    if (!owner.current()) return;
    ctx.ownership.changeList(key);
    port.patch(key, { threads: without(port.chat(key).threads, threadId) });
    if (selection.current() && port.chat(key).threadId === threadId) newThread(key);
  };
  return {
    loadThreads: async (key: number) => {
      await load(key);
    },
    openThread,
    newThread,
    deleteThread: remove,
    resume: async (key: number) => {
      const owner = ctx.ownership.captureChat(key);
      if (!(await load(key)) || !owner.current()) return;
      const c = port.chat(key),
        latest = c.threads?.[0];
      if (latest && c.threadId === null && c.messages.length === 0 && !c.isRunning) await openThread(key, latest.id);
    },
  };
}
const without = (threads: AssistantThreadSummary[] | null, id: number) => threads?.filter((t) => t.id !== id) ?? null;
