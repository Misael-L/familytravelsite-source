import { describe, expect, it } from 'vitest';
import * as legacyScopes from '../../../src/components/Planner/stayActionScope';
import type { QueuedMutation } from '../../../src/db/offlineDb';
import * as events from '../../../src/db/privateSessionEvents';
import * as format from '../../../src/db/queueFormat';
import * as retention from '../../../src/db/retainedCommand';
import * as scopes from '../../../src/hooks/useStayActionScope';
import * as legacyEvents from '../../../src/sync/privateSessionEvents';
import * as legacyFormat from '../../../src/sync/queueFormat';
import * as legacyRetention from '../../../src/sync/retainedCommand';

const mutation = (overrides: Partial<QueuedMutation> = {}): QueuedMutation => ({
  id: 'foundation-fixture',
  tripId: 1,
  method: 'PUT',
  url: '/trips/1/places/2',
  body: { name: 'Original' },
  createdAt: 0,
  status: 'pending',
  attempts: 0,
  lastError: null,
  schemaVersion: format.MUTATION_SCHEMA_VERSION,
  ...overrides,
});

describe('shared offline foundation across compatibility imports', () => {
  it('retires listeners from either path and preserves their unsubscribe lifetime', () => {
    let calls = 0;
    const oldListener = legacyEvents.onPrivateSessionEnd(() => {
      calls++;
    });
    const newListener = events.onPrivateSessionEnd(() => {
      calls++;
    });
    try {
      events.notifyPrivateSessionEnd();
      expect(calls).toBe(2);
      oldListener();
      legacyEvents.notifyPrivateSessionEnd();
      expect(calls).toBe(3);
      newListener();
      events.notifyPrivateSessionEnd();
      expect(calls).toBe(3);
    } finally {
      oldListener();
      newListener();
    }
  });

  it('shares cleanup-failure accounting without suppressing other retirements', () => {
    const before = events.privateSessionCleanupFailures();
    let retired = false;
    const fail = legacyEvents.onPrivateSessionEnd(() => {
      throw new Error('synthetic cleanup failure');
    });
    const next = events.onPrivateSessionEnd(() => {
      retired = true;
    });
    try {
      legacyEvents.notifyPrivateSessionEnd();
      expect(retired).toBe(true);
      expect(events.privateSessionCleanupFailures()).toBe(before + 1);
      expect(legacyEvents.privateSessionCleanupFailures()).toBe(before + 1);
    } finally {
      fail();
      next();
    }
  });

  it('shares cohort retention and its idempotent release across old and new paths', () => {
    const row = mutation();
    expect(retention.isProtectedQueueWork(row)).toBe(false);
    const release = legacyRetention.installFamilyCommandRetention();
    try {
      expect(retention.isProtectedQueueWork(row)).toBe(true);
      expect(legacyRetention.isRetainedCommand(row)).toBe(true);
    } finally {
      release();
      release();
    }
    expect(retention.isProtectedQueueWork(row)).toBe(false);
  });

  it('preserves unknown formats and explicit original intent with no active cohort', () => {
    expect(legacyFormat.MUTATION_SCHEMA_VERSION).toBe(format.MUTATION_SCHEMA_VERSION);
    expect(legacyFormat.isSupportedMutationFormat({})).toBe(true);
    expect(format.isSupportedMutationFormat({ schemaVersion: 0 })).toBe(false);
    expect(retention.isProtectedQueueWork(mutation({ schemaVersion: format.MUTATION_SCHEMA_VERSION + 1 }))).toBe(true);
    expect(legacyRetention.isProtectedQueueWork(mutation({ retentionPolicy: 'family-original-v1' }))).toBe(true);
  });

  it('keeps error identity so existing catches still refuse unsafe recovery', () => {
    expect(new retention.RetainedCommandError()).toBeInstanceOf(legacyRetention.RetainedCommandError);
    expect(new legacyRetention.RetainedCommandError()).toBeInstanceOf(retention.RetainedCommandError);
  });

  it('uses the same owner-scoped hooks for range guards and existing native forms', () => {
    expect(legacyScopes.captureStayAction).toBe(scopes.captureStayAction);
    expect(legacyScopes.useStayActionScope).toBe(scopes.useStayActionScope);
    expect(legacyScopes.useStayState).toBe(scopes.useStayState);
  });
});
