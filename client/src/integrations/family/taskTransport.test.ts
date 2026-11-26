import { describe, expect, it, vi } from 'vitest';
import {
  taskFixtureAt as at,
  canonicalTask,
  canonicalTaskScope,
  taskFixtureId as id,
  requireTaskValue as required,
} from '../../../tests/helpers/familyTasks';
import { taskCommand, type TaskAck, type TaskCommand, type TaskRow } from './taskContract';
import { createTaskTransport } from './taskTransport';
const scope = canonicalTaskScope();
const identity = {
  trip_id: scope.trip_id,
  family_id: scope.family_id,
  user_id: scope.user_id,
  person_id: scope.person_id,
};
const list = () => ({
  version: 1,
  scope: structuredClone(scope),
  collection_revision: 7,
  tasks: [canonicalTask()],
  trash_count: 1,
});
const command = (changes: Partial<TaskCommand> = {}): TaskCommand =>
  ({
    version: 1,
    operation_id: id(10),
    scope: structuredClone(scope),
    action: 'update',
    target_id: id(5),
    expected_revision: 3,
    expected_collection_revision: null,
    values: { description: null },
    ...changes,
  }) as TaskCommand;
function ack(p: TaskCommand): TaskAck {
  return {
    version: 1,
    trip_id: scope.trip_id,
    scope: structuredClone(p.scope),
    operation_id: p.operation_id,
    action: p.action,
    target_id: p.target_id,
    collection_revision: 8,
    task:
      p.action === 'reorder'
        ? null
        : canonicalTask({
            id: p.target_id,
            revision: p.action === 'create' ? 1 : p.expected_revision + 1,
            ...p.values,
            ...(p.action === 'create' ? { name: String(p.values.name).replace(/^ +| +$/g, '') } : {}),
            ...(p.action === 'trash' ? { deleted_at: at, deleted_by_person_id: scope.person_id } : {}),
          }),
    ordered_ids: p.action === 'reorder' ? [...p.values.ids] : null,
  };
}
function setup(raw: unknown) {
  const rpc = vi.fn(async () => structuredClone(raw));
  return { rpc, transport: createTaskTransport(rpc) };
}
function deferred<T>() {
  let resolve!: (x: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('canonical task transport', () => {
  it('reads exact canonical text, nullable values, dates and microsecond timestamps without fabricating reminders', async () => {
    const raw = list(),
      { rpc, transport } = setup(raw),
      result = await transport.list(identity);
    expect(result).toEqual(raw);
    expect(result).not.toBe(raw);
    expect(result.tasks[0].description).toBe('  Family notes\nline two  ');
    expect(result.tasks[0].due_date).toBe('2027-04-01');
    expect(result.tasks[0].created_at).toBe(at);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_family_trip_tasks_v1', { p_trip_id: scope.trip_id });
  });
  it('does not turn denied or failed reads into an empty list', async () => {
    const failure = { code: '42501', message: 'Denied' },
      rpc = vi.fn().mockRejectedValue(failure);
    await expect(createTaskTransport(rpc).list(identity)).rejects.toMatchObject({
      status: 403,
      code: 'task_access_denied',
    });
  });
  it('takes identity from a complete caller scope while preserving the service lifecycle scope', async () => {
    const raw = list();
    raw.scope.trip_lifecycle_revision = 2;
    expect((await setup(raw).transport.list(scope)).scope.trip_lifecycle_revision).toBe(2);
  });
  it('preserves an unknown transport failure for reconciliation', async () => {
    const failure = new Error('Lost connection'),
      rpc = vi.fn().mockRejectedValue(failure);
    await expect(createTaskTransport(rpc).list(identity)).rejects.toBe(failure);
  });
  it('accepts an actual empty task list', async () => {
    const raw = { ...list(), tasks: [], collection_revision: 0, trash_count: 0 };
    expect(await setup(raw).transport.list(identity)).toEqual(raw);
  });
  for (const key of ['trip_id', 'family_id', 'user_id', 'person_id'] as const) {
    it(`rejects a different canonical ${key}`, async () => {
      const raw = list();
      raw.scope[key] = id(99);
      await expect(setup(raw).transport.list(identity)).rejects.toMatchObject({ code: 'invalid_task_response' });
    });
  }
  for (const [name, mutate] of [
    ['unknown version', (x: ReturnType<typeof list>) => Object.assign(x, { version: 2 })],
    ['unknown envelope fields', (x: ReturnType<typeof list>) => Object.assign(x, { extra: true })],
    ['draft scope', (x: ReturnType<typeof list>) => Object.assign(x.scope, { layer: 'myDraft' })],
    [
      'unsafe collection revision',
      (x: ReturnType<typeof list>) => {
        x.collection_revision = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'unsafe lifecycle revision',
      (x: ReturnType<typeof list>) => {
        x.scope.trip_lifecycle_revision = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'unsafe row revision',
      (x: ReturnType<typeof list>) => {
        x.tasks[0].revision = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'foreign task Trip',
      (x: ReturnType<typeof list>) => {
        x.tasks[0].trip_id = id(99);
      },
    ],
    [
      'duplicate task identity',
      (x: ReturnType<typeof list>) => {
        x.tasks.push(x.tasks[0]);
      },
    ],
    [
      'trashed active row',
      (x: ReturnType<typeof list>) => {
        Object.assign(x.tasks[0], { deleted_at: at, deleted_by_person_id: id(4) });
      },
    ],
    [
      'incomplete tombstone',
      (x: ReturnType<typeof list>) => {
        x.tasks[0].deleted_at = at;
      },
    ],
    [
      'timestamp due date',
      (x: ReturnType<typeof list>) => {
        x.tasks[0].due_date = at;
      },
    ],
    [
      'invalid civil date',
      (x: ReturnType<typeof list>) => {
        x.tasks[0].due_date = '2027-02-29';
      },
    ],
    [
      'invented year zero',
      (x: ReturnType<typeof list>) => {
        x.tasks[0].due_date = '0000-01-01';
      },
    ],
    [
      'infinite timestamp',
      (x: ReturnType<typeof list>) => {
        x.tasks[0].created_at = 'infinity';
      },
    ],
    [
      'missing timestamp',
      (x: ReturnType<typeof list>) => {
        Object.assign(x.tasks[0], { updated_at: null });
      },
    ],
    [
      'unsorted rows',
      (x: ReturnType<typeof list>) => {
        x.tasks.push(canonicalTask({ id: id(6), sort_order: -1 }));
      },
    ],
    [
      'bad boolean',
      (x: ReturnType<typeof list>) => {
        Object.assign(x.tasks[0], { checked: 1 });
      },
    ],
    [
      'invalid UUID',
      (x: ReturnType<typeof list>) => {
        x.tasks[0].id = 'bad';
      },
    ],
    [
      'unknown row field',
      (x: ReturnType<typeof list>) => {
        Object.assign(x.tasks[0], { notes: 'not in this version' });
      },
    ],
  ] as const)
    it(`refuses ${name} before projection`, async () => {
      const raw = list();
      mutate(raw);
      await expect(setup(raw).transport.list(identity)).rejects.toMatchObject({ code: 'invalid_task_response' });
    });
  it('permits preserved legacy whitespace and duplicate/gapped/negative sort positions with UUID tie ordering', async () => {
    const raw = {
      ...list(),
      tasks: [
        canonicalTask({ id: id(5), name: '  old name  ', sort_order: -2 }),
        canonicalTask({ id: id(6), sort_order: -2 }),
      ],
    };
    expect((await setup(raw).transport.list(identity)).tasks).toEqual(raw.tasks);
  });
  it('refuses rows beyond the active bound', async () => {
    const raw = {
      ...list(),
      tasks: Array.from({ length: 2001 }, (_, i) => canonicalTask({ id: id(100 + i), sort_order: i })),
    };
    await expect(setup(raw).transport.list(identity)).rejects.toMatchObject({ code: 'invalid_task_response' });
  });
  it('refuses an oversized response rather than dropping text', async () => {
    const raw = list();
    raw.tasks[0].description = 'x'.repeat(8388608);
    await expect(setup(raw).transport.list(identity)).rejects.toMatchObject({ code: 'invalid_task_response' });
  });
  it('freezes the expected identity by parsing before an awaited response', async () => {
    const held = deferred<unknown>(),
      expected = { ...identity },
      transport = createTaskTransport(() => held.promise);
    const pending = transport.list(expected);
    expected.person_id = id(99);
    held.resolve(list());
    await expect(pending).resolves.toMatchObject({ scope });
  });
});

describe('task Trash pagination', () => {
  const trashRow = (n: number, time = at): TaskRow =>
    canonicalTask({ id: id(n), deleted_at: time, deleted_by_person_id: scope.person_id });
  const page = (tasks: TaskRow[] = [trashRow(5)]) => ({
    version: 1,
    scope,
    collection_revision: 9,
    tasks,
    next_cursor: null as { id: string; deleted_at: string } | null,
  });
  it('sends a complete cursor and preserves microsecond ordering even within one millisecond', async () => {
    const rows = [trashRow(7, '2026-11-08T12:34:56.123456+00:00'), trashRow(5, '2026-11-08T12:34:56.123455+00:00')];
    const raw = { ...page(rows), next_cursor: { id: rows[1].id, deleted_at: required(rows[1].deleted_at) } };
    const { transport, rpc } = setup(raw),
      before = { id: id(3), deleted_at: '2026-11-08T12:34:56.123457+00:00' };
    expect(await transport.trash(identity, 2, before)).toEqual(raw);
    expect(rpc).toHaveBeenCalledWith('list_family_trip_task_trash_v1', {
      p_trip_id: identity.trip_id,
      p_limit: 2,
      p_before: before.deleted_at,
      p_before_id: before.id,
    });
  });
  for (const limit of [0, 101, 1.5, Number.NaN])
    it(`rejects invalid page limit ${limit}`, async () => {
      const { transport, rpc } = setup(page());
      await expect(transport.trash(identity, limit)).rejects.toMatchObject({ code: 'task_cursor' });
      expect(rpc).not.toHaveBeenCalled();
    });
  for (const [name, raw] of [
    ['active row', page([canonicalTask()])],
    ['foreign row', page([trashRow(5), { ...trashRow(6), trip_id: id(99) }])],
    ['duplicate row', page([trashRow(5), trashRow(5)])],
    ['wrong cursor', { ...page([trashRow(5), trashRow(6)]), next_cursor: { id: id(99), deleted_at: at } }],
    ['unsorted page', page([trashRow(6), trashRow(5)])],
    ['short continued page', { ...page(), next_cursor: { id: id(5), deleted_at: at } }],
  ] as const)
    it(`refuses a ${name}`, async () => {
      await expect(setup(raw).transport.trash(identity, 2)).rejects.toMatchObject({ code: 'invalid_task_response' });
    });
});

describe('observed task transport without native installation', () => {
  for (const p of [
    command(),
    command({ values: { name: 'Renamed' } }),
    command({ action: 'completion', values: { checked: true } }),
    command({ action: 'trash', values: {} }),
    command({ action: 'restore', values: {} }),
    command({
      action: 'create',
      expected_revision: null,
      values: { name: '  Café  ', due_date: '2027-04-01', description: null, assigned_person_id: null },
    }),
    command({
      action: 'reorder',
      target_id: null,
      expected_revision: null,
      expected_collection_revision: 7,
      values: { ids: [id(5), id(6)] },
    }),
  ])
    it(`sends the original ${p.action} contract and checks the historical acknowledgement`, async () => {
      const raw = ack(p),
        { transport, rpc } = setup(raw);
      expect(await transport.execute(p)).toEqual(raw);
      expect(rpc).toHaveBeenCalledExactlyOnceWith('execute_family_trip_task_v1', {
        p_trip_id: scope.trip_id,
        p_scope: p.scope,
        p_action: p.action,
        p_operation_id: p.operation_id,
        p_target_id: p.target_id,
        p_expected_revision: p.expected_revision,
        p_expected_collection_revision: p.expected_collection_revision,
        p_values: p.values,
      });
      expect(p.values).toEqual(
        p.action === 'create'
          ? { name: '  Café  ', due_date: '2027-04-01', description: null, assigned_person_id: null }
          : p.values
      );
    });
  for (const [name, mutate] of [
    [
      'wrong operation',
      (x: TaskAck) => {
        x.operation_id = id(99);
      },
    ],
    [
      'wrong target',
      (x: TaskAck) => {
        x.target_id = id(99);
      },
    ],
    [
      'wrong action',
      (x: TaskAck) => {
        x.action = 'create';
      },
    ],
    [
      'wrong row',
      (x: TaskAck) => {
        required(x.task).id = id(99);
      },
    ],
    [
      'wrong observation',
      (x: TaskAck) => {
        required(x.task).revision = 99;
      },
    ],
    [
      'wrong scope',
      (x: TaskAck) => {
        x.scope.person_id = id(99);
      },
    ],
    [
      'wrong content',
      (x: TaskAck) => {
        required(x.task).description = 'Did not clear';
      },
    ],
    [
      'unexpected Trash',
      (x: TaskAck) => {
        required(x.task).deleted_at = at;
        required(x.task).deleted_by_person_id = scope.person_id;
      },
    ],
  ] as const)
    it(`refuses an acknowledgement with ${name}`, async () => {
      const raw = ack(command());
      mutate(raw);
      await expect(setup(raw).transport.execute(command())).rejects.toMatchObject({ code: 'invalid_task_response' });
    });
  for (const values of [
    { name: '' },
    { priority: true },
    { priority: 4 },
    { category: null },
    { checked: true },
    { due_date: at },
    { due_date: '0000-01-01' },
    { name: undefined },
    {},
  ])
    it(`rejects invalid update values ${JSON.stringify(values)}`, async () => {
      const { transport, rpc } = setup(null);
      await expect(transport.execute(command({ values } as never))).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    });
  it('preserves omitted versus null values and detached original intent during an awaited reply', async () => {
    const p = command(),
      held = deferred<unknown>(),
      rpc = vi.fn((_name: string, _args: Record<string, unknown>) => held.promise),
      transport = createTaskTransport(rpc);
    const pending = transport.execute(p),
      original = structuredClone(p);
    (p.values as { description: string | null }).description = 'Later';
    p.scope.person_id = id(99);
    held.resolve(ack(original));
    expect(await pending).toEqual(ack(original));
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_values: { description: null }, p_scope: original.scope });
  });
  it('permits every UUID in a supported 2000-task reorder', async () => {
    const p = command({
      action: 'reorder',
      target_id: null,
      expected_revision: null,
      expected_collection_revision: 7,
      values: { ids: Array.from({ length: 2000 }, (_, i) => id(100 + i)) },
    });
    expect((await setup(ack(p)).transport.execute(p)).ordered_ids).toHaveLength(2000);
  });
  it('preserves PostgreSQL trimmed-name and Unicode code-point rules', async () => {
    const p = command({ action: 'create', expected_revision: null, values: { name: ' ' + '🧭'.repeat(500) + ' ' } });
    expect(taskCommand.parse(p).values).toEqual(p.values);
    expect(required((await setup(ack(p)).transport.execute(p)).task).name).toBe('🧭'.repeat(500));
  });
  it('keeps typed date-only values as strings', () => {
    const p = command({ values: { due_date: '2027-04-01' } });
    expect(taskCommand.parse(p).values).toEqual(p.values);
  });
});

describe('original task receipt reconciliation', () => {
  it('retains unknown as unresolved without manufacturing another operation', async () => {
    const raw = { version: 1, scope, trip_id: scope.trip_id, operation_id: id(10), status: 'unknown', result: null },
      { rpc, transport } = setup(raw);
    expect(await transport.receipt(identity, id(10))).toEqual(raw);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('accepts a committed historical receipt after parent recovery without turning it into current state', async () => {
    const raw = {
      version: 1,
      scope: { ...scope, trip_lifecycle_revision: 2 },
      trip_id: scope.trip_id,
      operation_id: id(10),
      status: 'committed',
      result: ack(command()),
    };
    expect(await setup(raw).transport.receipt(identity, id(10))).toEqual(raw);
  });
  for (const [name, change] of [
    ['false committed status', { status: 'unknown' }],
    ['missing committed result', { result: null }],
    ['foreign operation', { operation_id: id(99) }],
    ['foreign Trip', { trip_id: id(99) }],
    ['future lifecycle', { result: { ...ack(command()), scope: { ...scope, trip_lifecycle_revision: 9 } } }],
  ] as const)
    it(`refuses ${name}`, async () => {
      const raw = {
        version: 1,
        scope,
        trip_id: scope.trip_id,
        operation_id: id(10),
        status: 'committed',
        result: ack(command()),
        ...change,
      };
      await expect(setup(raw).transport.receipt(identity, id(10))).rejects.toMatchObject({
        code: 'invalid_task_response',
      });
    });
});
