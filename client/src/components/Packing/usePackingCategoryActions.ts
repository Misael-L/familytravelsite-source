import { useLayoutEffect, useMemo, useReducer } from 'react';
import { hasReadOnlySession } from '../../db/readOnlySession';
import {
  currentPlannerPackingPort,
  type PackingCategoryBinding,
  type PackingCategoryMember,
  type PlannerPackingPort,
} from '../../repo/plannerPackingPort';
import { currentSavedPackingReadPort, type SavedPackingReadPort } from '../../repo/savedPackingReadPort';
import { captureReadSession } from '../../sync/readSession';
import type { PackingItem } from '../../types';
import { usePackingSnapshot } from './usePackingSnapshot';

type Kind = 'rename' | 'assign';
type Entry = {
  binding: PackingCategoryBinding;
  session: ReturnType<typeof captureReadSession>;
  kind: Kind;
  intent: string | null;
  flight: Promise<void> | null;
  completed: boolean;
};
type Options = {
  trip: number | string;
  view: 'common' | 'personal';
  defaultCategory: string;
  items: PackingItem[];
  authorized: boolean;
  report: (error: unknown) => void;
};
type Context = {
  trip: number | string;
  view: Options['view'];
  port: PlannerPackingPort | null;
  reader?: SavedPackingReadPort | null;
};
type Assignees = import('../../repo/plannerPackingPort').PackingCategoryAccess['assignees'];
class PackingCategoryOwner {
  private entries = new Map<string, Entry>();
  private rosters = new Map<string, PackingCategoryMember[]>();
  private active = true;
  readonly family: boolean;
  constructor(
    private options: () => Options,
    private notify: () => void,
    private context: Context
  ) {
    this.family = context.port !== null || !!context.reader;
  }
  update = (next: Options) => {
    const previous = this.options();
    this.options = () => next;
    if (previous.items !== next.items || previous.authorized !== next.authorized) this.notify();
  };
  private changed() {
    return new Error('The original category action ended. Reopen or recover it before saving.');
  }
  private current() {
    const o = this.options();
    return (
      this.active &&
      currentPlannerPackingPort() === this.context.port &&
      currentSavedPackingReadPort() === (this.context.reader ?? null) &&
      o.trip === this.context.trip &&
      o.view === this.context.view
    );
  }
  access = (label: string) => {
    const o = this.options(),
      reader = this.context.reader ?? this.context.port;
    return this.current() && reader?.categoryAccess
      ? reader.categoryAccess(o.trip, { view: o.view, label, defaultCategory: o.defaultCategory }, o.items)
      : null;
  };
  available = (label: string, kind: Kind) => {
    if (!this.current() || hasReadOnlySession() || this.context.reader || !this.options().authorized) return false;
    if (!this.context.port) return true;
    const a = this.access(label);
    return !!a && (kind === 'rename' ? a.canRename : a.canAssign);
  };
  activate = () => {
    this.active = true;
  };
  dispose = () => {
    this.active = false;
    for (const e of this.entries.values()) e.binding.close();
  };
  private bind(label: string, kind: Kind) {
    if (!this.available(label, kind)) throw this.changed();
    const port = this.context.port;
    if (!port) return;
    const previous = this.entries.get(label);
    if (previous && !previous.completed && previous.intent !== null) {
      if (previous.kind !== kind || !previous.session.current()) throw this.changed();
      return;
    }
    previous?.binding.close();
    const a = this.access(label);
    if (!a || !port.bindCategory) throw this.changed();
    this.entries.set(label, {
      binding: port.bindCategory(this.context.trip, a.id),
      session: captureReadSession(),
      kind,
      intent: null,
      flight: null,
      completed: false,
    });
  }
  begin = (label: string, kind: Kind) => {
    try {
      this.bind(label, kind);
      return true;
    } catch (error) {
      this.options().report(error);
      return false;
    }
  };
  openAssignments = (label: string) => {
    try {
      this.bind(label, 'assign');
      const port = this.context.port;
      if (!port) return true;
      const e = this.entries.get(label);
      if (!e || !port.categoryMembers) throw this.changed();
      void port
        .categoryMembers(this.context.trip)
        .then((people) => {
          if (!this.current() || !e.session.current() || this.entries.get(label) !== e) return;
          this.rosters.set(label, people);
          this.notify();
        })
        .catch((error) => {
          if (this.current() && e.session.current()) this.options().report(error);
        });
      return true;
    } catch (error) {
      this.options().report(error);
      return false;
    }
  };
  members = (label: string, native: PackingCategoryMember[]) => {
    if (!this.context.port) return native;
    const eligible = this.rosters.get(label) ?? [],
      assigned = this.access(label)?.assignees ?? [],
      ids = new Set(eligible.map((x) => x.id));
    return eligible.concat(
      assigned
        .filter((x) => !ids.has(x.user_id))
        .map((x) => ({ id: x.user_id, username: x.username, is_guest: x.is_guest, eligible: false }))
    );
  };
  assignees = (label: string, native: Assignees) => {
    if (!this.current()) return [];
    const o = this.options();
    if (this.context.reader)
      return this.context.reader.assignees(
        o.trip,
        { view: o.view, label, defaultCategory: o.defaultCategory },
        o.items
      );
    return this.context.port ? (this.access(label)?.assignees ?? []) : native;
  };
  busy = (label: string) => {
    const flight = this.entries.get(label)?.flight;
    return flight !== null && flight !== undefined;
  };
  cancel = (label: string) => {
    const e = this.entries.get(label);
    if (e && (e.intent === null || e.completed)) {
      e.binding.close();
      this.entries.delete(label);
    }
  };
  rename = (label: string, name: string) => this.submit(label, 'rename', name);
  assign = async (label: string, ids: number[]) => {
    const e = this.entries.get(label);
    if (!e || e.completed) this.bind(label, 'assign');
    return this.submit(
      label,
      'assign',
      [...ids].sort((a, b) => a - b)
    );
  };
  private async submit(label: string, kind: Kind, value: string | number[]) {
    const e = this.entries.get(label);
    if (!e || hasReadOnlySession() || !this.current() || !e.session.current() || e.kind !== kind || e.completed)
      throw this.changed();
    const intent = JSON.stringify(value);
    if (e.intent !== null && e.intent !== intent)
      throw new Error('Recover the original category save before changing it.');
    e.intent ??= intent;
    if (e.flight !== null) return e.flight;
    e.flight = (async () => {
      if (kind === 'rename') await e.binding.rename(value as string);
      else await e.binding.assign(value as number[]);
      if (!this.current() || !e.session.current()) throw this.changed();
      e.completed = true;
    })();
    this.notify();
    try {
      await e.flight;
    } finally {
      e.flight = null;
      if (e.completed && this.entries.get(label) === e) {
        e.binding.close();
        this.entries.delete(label);
        if (kind === 'rename') this.rosters.delete(label);
      }
      if (this.current()) this.notify();
    }
  }
}
export function createPackingCategoryActions(options: () => Options, notify: () => void, context?: Context) {
  const o = context ?? {
    trip: options().trip,
    view: options().view,
    port: currentPlannerPackingPort(),
    reader: currentSavedPackingReadPort(),
  };
  return new PackingCategoryOwner(options, notify, o);
}
export type NativePackingCategoryActions = ReturnType<typeof createPackingCategoryActions>;
export function usePackingCategoryActions(options: Options) {
  const { port, reader } = usePackingSnapshot(options.trip);
  const { trip, view, defaultCategory } = options;
  const [, notify] = useReducer((n: number) => n + 1, 0);
  const owner = useMemo(
    () =>
      createPackingCategoryActions(
        () => ({ trip, view, defaultCategory, items: [], authorized: false, report: () => {} }),
        notify,
        { trip, view, port, reader }
      ),
    [trip, view, defaultCategory, port, reader]
  );
  useLayoutEffect(() => {
    owner.update(options);
  }, [owner, options]);
  useLayoutEffect(() => {
    owner.activate();
    return () => owner.dispose();
  }, [owner]);
  return owner;
}
