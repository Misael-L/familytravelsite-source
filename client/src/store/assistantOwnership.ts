import { logoutInProgress } from '../sync/logoutCoordinator';
import { captureReadSession } from '../sync/readSession';

const bump = (map: Map<number, number>, key: number) => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

/** Independent account, conversation, list and view clocks; numeric trip/home/Journey keys stay native. */
export function createAssistantOwnership() {
  let owner = 0,
    policy = 0,
    statusRead = 0;
  const chats = new Map<number, number>(),
    lists = new Map<number, number>();
  const views = new Map<number, Set<symbol>>();
  const queues = new Map<number, { current: () => boolean; promise: Promise<unknown> }>();
  const capture = (valid: () => boolean = () => true, policySensitive = true) => {
    const session = captureReadSession(),
      started = owner,
      originalPolicy = policy;
    const current = () =>
      session.current() && owner === started && (!policySensitive || policy === originalPolicy) && valid();
    return {
      current,
      assertCurrent: () => {
        if (!current()) throw new Error('The original assistant context ended.');
      },
    };
  };
  const captureChat = (key: number) => {
    const chat = chats.get(key);
    return capture(() => chats.get(key) === chat);
  };
  return {
    serialize: <T>(key: number, current: () => boolean, operation: () => Promise<T>, retired: T): Promise<T> => {
      const prior = queues.get(key);
      const previous = prior?.current() ? prior.promise : Promise.resolve();
      const job: { current: () => boolean; promise: Promise<T> } = { current, promise: Promise.resolve(retired) };
      job.promise = Promise.allSettled([previous])
        .then(() => (current() ? operation() : retired))
        .finally(() => {
          if (queues.get(key) === job) queues.delete(key);
        });
      queues.set(key, job);
      return job.promise;
    },
    version: (key: number) => `${owner}/${policy}/${chats.get(key) ?? 0}`,
    captureOwner: capture,
    captureAccount: () => capture(() => true, false),
    captureChat,
    replaceChat: (key: number) => {
      bump(chats, key);
      return captureChat(key);
    },
    readList: (key: number) => {
      bump(lists, key);
      const list = lists.get(key);
      return capture(() => lists.get(key) === list);
    },
    changeList: (key: number) => bump(lists, key),
    readStatus: () => {
      const read = ++statusRead;
      return capture(() => statusRead === read);
    },
    changePolicy: () => {
      policy++;
      statusRead++;
    },
    endSession: () => {
      owner++;
      policy++;
      statusRead++;
      chats.clear();
      lists.clear();
      views.clear();
      queues.clear();
    },
    binding: () => {
      const started = owner;
      return () => started === owner && !logoutInProgress();
    },
    show: (key: number) => {
      const owner = capture(() => true, false),
        token = Symbol('assistant-view');
      const showing = views.get(key) ?? new Set<symbol>();
      showing.add(token);
      views.set(key, showing);
      return () => {
        if (!owner.current() || !showing.delete(token) || showing.size > 0) return false;
        views.delete(key);
        return true;
      };
    },
  };
}
export type AssistantOwnership = ReturnType<typeof createAssistantOwnership>;

const ASYNC_ACTIONS = new Set([
  'loadStatus',
  'ackPrivacy',
  'ackStudioImages',
  'resume',
  'loadThreads',
  'openThread',
  'deleteThread',
  'send',
  'attach',
  'decide',
  'undo',
  'retry',
  'continueHere',
  'undoBlock',
  'addFoundPlace',
  'takeProposal',
  'insertFoundPlace',
]);
function retiredResult(name: string) {
  if (name === 'hostStudio' || name === 'holdDecisions') return () => undefined;
  if (name === 'undo') return Promise.resolve('failed');
  if (name === 'undoBlock') return Promise.resolve({ done: 0, stale: 0, failed: 1 });
  if (name === 'takeProposal' || name === 'insertFoundPlace') return Promise.resolve('skipped');
  return ASYNC_ACTIONS.has(name) ? Promise.resolve() : undefined;
}
/** Replaced on session teardown, so retained store callbacks cannot start work for the next account. */
export function bindAssistantActions<T extends object>(actions: T, current: () => boolean, observe: () => void): T {
  return Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      (...args: unknown[]) => {
        if (!current()) return retiredResult(name);
        observe();
        return (action as (...values: unknown[]) => unknown)(...args);
      },
    ])
  ) as T;
}
