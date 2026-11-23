import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { setAuthed } from '../../sync/authGate';
import { NOT_HANDLED } from './listHandler';
import { createPackingBagCommandHandler } from './packingBagCommandHandler';
import { createPackingCategoryAggregateCommandHandler } from './packingCategoryAggregateCommandHandler';
import { createPackingCategoryCommandHandler } from './packingCategoryCommandHandler';
import { createPackingCategoryV2CommandHandler } from './packingCategoryV2CommandHandler';
import { createPackingGroupCommandHandler } from './packingGroupCommandHandler';
import { FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

const domains = [
  { label: 'bag', routes: ['bag-commands'], maxBytes: 1048576, create: createPackingBagCommandHandler },
  {
    label: 'category aggregate',
    routes: ['category-aggregate-v3'],
    maxBytes: 8388608,
    create: createPackingCategoryAggregateCommandHandler,
  },
  {
    label: 'category v1',
    routes: ['category-commands'],
    maxBytes: 8388608,
    create: createPackingCategoryCommandHandler,
  },
  {
    label: 'category v2',
    routes: ['category-lifecycle-v2', 'category-items-v2'],
    maxBytes: 8388608,
    create: createPackingCategoryV2CommandHandler,
  },
  { label: 'group', routes: ['group-commands'], maxBytes: 8388608, create: createPackingGroupCommandHandler },
];

function createFixture() {
  const loadSession = vi.fn(async () => {
    throw new Error('Unexpected session read');
  });
  const rpc = vi.fn(async () => {
    throw new Error('Unexpected packing transport');
  });
  const repo = new FamilyFrontendRepository(loadSession);
  const captureContext = vi.spyOn(repo, 'captureContext');
  const handlers = domains.map((domain) => ({
    ...domain,
    handle: domain.create(
      repo,
      () => 'https://packing.fixture.invalid',
      () => false,
      rpc
    ),
  }));
  return { loadSession, rpc, captureContext, handlers };
}

const prefix = '/trips/23/family/packing/';
function request(pathname: string, method = 'GET', body?: unknown): FamilyRequest {
  return { method, pathname, query: new URLSearchParams(), body };
}

beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  setAuthed(true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  setAuthed(false);
  await resetOfflineTestDatabase();
});

describe('qualified packing request routes', () => {
  const ownedRoutes = domains.flatMap(({ label, routes }) => routes.map((route) => ({ label, route })));
  it.each(ownedRoutes)('only $label claims $route', async ({ label, route }) => {
    const { handlers, captureContext, loadSession, rpc } = createFixture();
    for (const handler of handlers) {
      const result = handler.handle(request(prefix + route));
      if (handler.label === label) {
        await expect(result).rejects.toMatchObject({ status: 400, code: 'packing_command_shape' });
      } else {
        await expect(result).resolves.toBe(NOT_HANDLED);
      }
    }
    expect(captureContext).toHaveBeenCalledTimes(1);
    expect(loadSession).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['commands', 'receipt', 'bag-commands/', 'category-items-v3'])(
    'leaves %s available to the rest of planner routing',
    async (route) => {
      const { handlers, captureContext, loadSession, rpc } = createFixture();
      for (const handler of handlers) await expect(handler.handle(request(prefix + route))).resolves.toBe(NOT_HANDLED);
      expect(captureContext).not.toHaveBeenCalled();
      expect(loadSession).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it.each(domains)('applies the $label UTF-8 limit before parsing', async ({ label, routes, maxBytes }) => {
    const { handlers, loadSession, rpc } = createFixture();
    const handler = handlers.find((candidate) => candidate.label === label);
    if (!handler) throw new Error('Missing packing handler fixture');
    // Each character takes two UTF-8 bytes and serializing the string adds two quotes.
    const exactLimit = 'é'.repeat((maxBytes - 2) / 2);
    await expect(handler.handle(request(prefix + routes[0], 'POST', exactLimit))).rejects.toMatchObject({
      status: 400,
      code: 'packing_command_contract',
    });
    await expect(handler.handle(request(prefix + routes[0], 'POST', exactLimit + 'é'))).rejects.toMatchObject({
      status: 400,
      code: 'packing_command_bound',
    });
    expect(loadSession).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
