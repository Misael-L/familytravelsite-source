import type { TodoCreateItemRequest, TodoUpdateItemRequest } from '@trek/shared';
import type { TaskCursor, TaskRow, TaskTrashPage } from '../integrations/family/taskContract';
import type { TodoItem } from '../types';
export type TaskEditOrigin = {
  close: () => void;
  save: (data: TodoCreateItemRequest | TodoUpdateItemRequest) => Promise<TodoItem>;
  trash: () => Promise<void>;
};
export type PlannerTaskPort = {
  bind: (item: TodoItem | null, trip?: number | string) => TaskEditOrigin;
  completion: (trip: number | string, item: TodoItem, checked: boolean) => Promise<void>;
  reorder: (trip: number | string, rows: TodoItem[], ids: number[]) => Promise<void>;
  trashPage: (before?: TaskCursor | null) => Promise<TaskTrashPage>;
  restore: (row: TaskRow) => Promise<void>;
  reconcile: () => Promise<'committed' | 'unknown' | 'none'>;
};
let port: PlannerTaskPort | null = null;
export const currentPlannerTaskPort = () => port;
export function installPlannerTaskPort(next: PlannerTaskPort) {
  if (port) throw new Error('A task writer is already installed.');
  port = next;
  return () => {
    if (port === next) port = null;
  };
}

/** Ordinary TREK calls keep their original argument shape outside the canonical cohort. */
export const taskOriginArgs = (origin?: TaskEditOrigin): [] | [TaskEditOrigin] => (origin ? [origin] : []);
export const taskRowArgs = (row?: TodoItem): [] | [TodoItem] => (row && 'family_task' in row ? [row] : []);
export const taskRowsArgs = (rows: TodoItem[]): [] | [TodoItem[]] =>
  rows.some((row) => 'family_task' in row) ? [rows] : [];
