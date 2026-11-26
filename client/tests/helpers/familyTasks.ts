import type { TaskRow, TaskScope } from '../../src/integrations/family/taskContract';
export const taskFixtureId = (n: number) => `a0580000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const taskFixtureAt = '2026-11-08T12:34:56.123456+00:00';
export function canonicalTask(changes: Partial<TaskRow> = {}): TaskRow {
  return {
    id: taskFixtureId(5),
    trip_id: taskFixtureId(1),
    name: 'Check museum hours',
    checked: false,
    category: 'Preparation',
    sort_order: 0,
    due_date: '2027-04-01',
    description: '  Family notes\nline two  ',
    assigned_person_id: taskFixtureId(6),
    priority: 2,
    created_at: taskFixtureAt,
    updated_at: taskFixtureAt,
    revision: 3,
    deleted_at: null,
    deleted_by_person_id: null,
    ...changes,
  };
}
export function canonicalTaskScope(changes: Partial<TaskScope> = {}): TaskScope {
  return {
    version: 1,
    trip_id: taskFixtureId(1),
    family_id: taskFixtureId(2),
    user_id: taskFixtureId(3),
    person_id: taskFixtureId(4),
    layer: 'published',
    trip_lifecycle_revision: 0,
    ...changes,
  };
}

export function requireTaskValue<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing task fixture value');
  return value;
}
