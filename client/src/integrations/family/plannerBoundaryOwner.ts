import { useMemo, useSyncExternalStore } from 'react';
import type { PlannerGovernancePort } from '../../repo/plannerGovernancePort';
import { useTripStore } from '../../store/tripStore';
import { onFamilyActorChange } from './actorEvents';
import type { FamilyIdentityRegistry } from './identity';
import type { FamilyFrontendRepository, FamilySession } from './repository';

export type PlannerReadProblem = {
  trip: string;
  message: string;
  current: () => boolean;
  retry: () => Promise<void>;
  taskRecovery?: import('./plannerTaskRecovery').PlannerTaskRecovery;
};
export type PlannerPublication = {
  trip: string;
  session: FamilySession;
  ids: FamilyIdentityRegistry;
  layer: 'published' | 'myDraft';
  current: () => boolean;
};
const coreFields = ['trip', 'places', 'days', 'assignments', 'dayNotes'] as const;
/** A publication is issued only by a checked cohort commit, never by legacy core reads. */
export class PlannerBoundaryOwner {
  private publication: PlannerPublication | null = null;
  private problem: PlannerReadProblem | null = null;
  setProblem(problem: PlannerReadProblem | null) {
    this.problem = problem;
    this.notify();
  }
  getProblem = () => (this.problem?.current() ? this.problem : null);
  private listeners = new Set<() => void>();
  constructor(
    readonly repository: FamilyFrontendRepository,
    readonly governance: PlannerGovernancePort
  ) {}
  private notify = () => {
    for (const fn of this.listeners) fn();
  };
  pause() {
    this.publication = null;
    this.notify();
  }
  publish(
    trip: string,
    session: FamilySession,
    ids: FamilyIdentityRegistry,
    layer: PlannerPublication['layer'],
    check: () => void
  ) {
    check();
    const before = useTripStore.getState();
    if (before.trip?.id !== ids.register('trip', trip)) throw new Error('Planner publication belongs to another Trip.');
    this.publication = {
      trip,
      session,
      ids,
      layer,
      current: () => {
        try {
          check();
          const now = useTripStore.getState();
          return coreFields.every((key) => now[key] === before[key]);
        } catch {
          return false;
        }
      },
    };
    this.notify();
  }
  get = () => (this.publication?.current() ? this.publication : null);
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    const native = useTripStore.subscribe(fn),
      actor = onFamilyActorChange(fn);
    return () => {
      this.listeners.delete(fn);
      native();
      actor();
    };
  };
}
let owner: PlannerBoundaryOwner | null = null;
const listeners = new Set<() => void>();
export const currentPlannerBoundaryOwner = () => owner;
export function installPlannerBoundaryOwner(next: PlannerBoundaryOwner) {
  if (owner) throw new Error('Planner boundary already installed.');
  owner = next;
  for (const fn of listeners) fn();
  return () => {
    if (owner !== next) return;
    owner = null;
    next.pause();
    for (const fn of listeners) fn();
  };
}
class BoundaryBinding {
  private state = { owner, owned: owner !== null };
  get = () => {
    if (owner !== this.state.owner) this.state = { owner, owned: this.state.owned || owner !== null };
    return this.state;
  };
  subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
}
/** A mounted boundary that joined this planner cannot fall back into legacy writers after release. */
export function usePlannerBoundaryBinding() {
  const binding = useMemo(() => new BoundaryBinding(), []);
  return useSyncExternalStore(binding.subscribe, binding.get, binding.get);
}
