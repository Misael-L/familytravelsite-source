import { FamilyApiError } from './errors';
import { FamilyIdentityRegistry } from './identity';
import * as capabilities from './legacy/data/supabase/capabilities';
import * as notes from './legacy/data/supabase/dayNotes';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import * as permissions from './legacy/data/supabase/familyPermissions';
import { listMemberFamilyPlaceCategories } from './legacy/data/supabase/familyPlaceCategories';
import * as packing from './legacy/data/supabase/packing';
import * as schedule from './legacy/data/supabase/scheduleItems';
import * as todos from './legacy/data/supabase/todos';
import * as changes from './legacy/data/supabase/tripChangeRequests';
import * as days from './legacy/data/supabase/tripDays';
import * as expenses from './legacy/data/supabase/tripExpenses';
import * as files from './legacy/data/supabase/tripFiles';
import * as places from './legacy/data/supabase/tripPlaces';
import * as reservations from './legacy/data/supabase/tripReservations';
import * as trips from './legacy/data/supabase/trips';
import { listTripTravelers } from './legacy/data/supabase/tripTravelers';
import type { WorkspaceItineraryLayer } from './legacy/pages/familyTripWorkspace/workspaceGovernanceModel';
import { writeModeForCapability } from './legacy/pages/familyTripWorkspace/workspaceGovernanceModel';
import { useAuthStore } from './legacy/store/authStore';
import { useSettingsStore } from './legacy/store/settingsStore';
import { clearFamilyReads, setFamilyRead, type FamilyResource } from './readState';
import { FamilyViews } from './views';
export { FamilyApiError } from './errors';
export { useAuthStore as familyAuthStore, useSettingsStore as familySettingsStore };

export const familyReaders = {
  trips,
  days,
  places,
  schedule,
  notes,
  reservations,
  expenses,
  files,
  packing,
  todos,
  permissions,
  capabilities,
  listTripTravelers,
  listMemberFamilyPlaceCategories,
};
export type FamilyReaders = typeof familyReaders;
export type FamilySession = {
  userId: string;
  personId: string;
  familyId: string;
  user: {
    username: string;
    email: string;
    avatar_url: string | null;
    created_at: string;
    mfa_enabled?: boolean;
  };
};
export type FamilyCore = {
  trip: NonNullable<Awaited<ReturnType<typeof trips.fetchTripById>>>;
  days: Awaited<ReturnType<typeof days.listTripDays>>;
  places: Awaited<ReturnType<typeof places.listTripPlaces>>;
  schedule: Awaited<ReturnType<typeof schedule.listScheduleItems>>;
  notes: Awaited<ReturnType<typeof notes.listDayNotes>>;
};

async function currentFamilySession(): Promise<FamilySession> {
  await useAuthStore.getState().loadUser({ silent: true });
  const s = useAuthStore.getState();
  if (s.authCheckFailed)
    throw new FamilyApiError(503, 'family_validation_pending', 'Family access is still being checked. Try again.');
  if (!s.isAuthenticated || !s.authUserId || !s.user)
    throw new FamilyApiError(401, 'session_required', 'Sign in to Family Travel.');
  if (s.authGate === null)
    throw new FamilyApiError(503, 'family_validation_pending', 'Family access is still being checked. Try again.');
  if (s.authGate !== 'ok' || !s.familyId || !s.personId)
    throw new FamilyApiError(
      403,
      `family_${s.authGate || 'access_required'}`,
      'Complete your Family Travel access requirements before continuing.'
    );
  return { userId: s.authUserId, personId: s.personId, familyId: s.familyId, user: s.user };
}

export type FamilyRepositoryContext = Pick<FamilySession, 'userId' | 'personId' | 'familyId'> & { source: string };

function contextKey(session: Pick<FamilySession, 'userId' | 'personId' | 'familyId'>, source = '') {
  return JSON.stringify([source.replace(/\/+$/, ''), session.userId, session.personId, session.familyId]);
}
function currentFamilyContext(): FamilyRepositoryContext | null {
  const s = useAuthStore.getState();
  if (!s.isAuthenticated || s.authGate !== 'ok' || s.authCheckFailed || !s.authUserId || !s.personId || !s.familyId)
    return null;
  return { source: getSupabaseUrl(), userId: s.authUserId, personId: s.personId, familyId: s.familyId };
}
function staleContext() {
  return new FamilyApiError(
    409,
    'stale_session',
    'The Family context changed. Reload before retrying; an issued request may have completed in its original context.'
  );
}

/** The only owner of canonical records used by the copied frontend and preserved map. */
export class FamilyFrontendRepository {
  private sessionTask: Promise<FamilySession> | null = null;
  private scope: string | null = null;
  private generation = 0;
  private tripEpochs = new Map<string, number>();
  private layerEpochs = new Map<string, number>();
  private resourceTasks = new Map<string, Promise<unknown>>();
  private bookingRecords = new Map<string, Promise<reservations.FamilyTripReservation[]>>();
  private transportRecords = new Map<string, Promise<reservations.FamilyTransportReservation[]>>();
  private cores = new Map<string, Promise<FamilyCore>>();
  private policies = new Map<
    string,
    Promise<{ canMutate: boolean; outcomes: Record<string, permissions.FamilyPermissionOutcome> }>
  >();
  private listeners = new Set<(tripId: string) => void>();
  private layers = new Map<string, WorkspaceItineraryLayer>();
  private view: FamilyViews | null = null;
  private fileReferences = new Map<string, { tripId: string; storagePath: string }>();
  private plannerControllerClaims = 0;
  private controllerLayers = new Map<string, (layer: WorkspaceItineraryLayer) => void>();
  constructor(
    private readonly getSession = currentFamilySession,
    readonly readers: FamilyReaders = familyReaders,
    private readonly getContext: (() => FamilyRepositoryContext | null) | undefined = getSession ===
    currentFamilySession
      ? currentFamilyContext
      : undefined
  ) {}
  /** Stable numeric IDs remain user-owned; canonical records/authority belong to the full context. */
  refreshContext() {
    if (!this.getContext || this.scope === null) return;
    const context = this.getContext();
    if (!context || this.scope !== contextKey(context, context.source)) this.clear();
  }
  private readonly contextListeners = new Set<(tripId?: string) => void>();
  subscribeContext(listener: (tripId?: string) => void) {
    this.contextListeners.add(listener);
    return () => {
      this.contextListeners.delete(listener);
    };
  }
  private notifyContext(tripId?: string) {
    for (const listener of [...this.contextListeners]) listener(tripId);
  }
  captureContext(tripId?: string, options: { revision?: boolean } = {}) {
    this.refreshContext();
    const generation = this.generation,
      epoch = tripId ? (this.tripEpochs.get(tripId) ?? 0) : 0;
    const layerEpoch = tripId ? (this.layerEpochs.get(tripId) ?? 0) : 0;
    const assertCurrent = () => {
      this.refreshContext();
      if (generation !== this.generation) throw staleContext();
      if (
        tripId &&
        (layerEpoch !== (this.layerEpochs.get(tripId) ?? 0) ||
          (options.revision !== false && epoch !== (this.tripEpochs.get(tripId) ?? 0)))
      )
        throw new FamilyApiError(409, 'stale_read', 'The trip or itinerary layer changed. Reload before retrying.');
    };
    return {
      assertCurrent,
      async perform<T>(operation: () => Promise<T>): Promise<T> {
        assertCurrent();
        try {
          const result = await operation();
          assertCurrent();
          return result;
        } catch (error) {
          assertCurrent();
          throw error;
        }
      },
    };
  }
  private async tripContext(value: number | string) {
    await this.session();
    this.refreshContext();
    if (!this.view) throw staleContext();
    const tripId = this.view.ids.uuid('trip', value);
    return { tripId, views: this.view, ...this.captureContext(tripId) };
  }
  async session(): Promise<FamilySession> {
    this.refreshContext();
    const generation = this.generation;
    if (this.sessionTask === null) {
      const loadingSource = this.getContext?.()?.source.replace(/\/+$/, '');
      const task = this.getSession().then((session) => {
        this.refreshContext();
        if (generation !== this.generation) throw staleContext();
        if (loadingSource !== undefined && loadingSource !== this.getContext?.()?.source.replace(/\/+$/, ''))
          throw staleContext();
        this.installSession(session);
        return session;
      });
      this.sessionTask = task;
      void task.catch(() => {
        if (this.sessionTask === task) this.sessionTask = null;
      });
    }
    const session = await this.sessionTask;
    this.refreshContext();
    if (generation !== this.generation) throw staleContext();
    return session;
  }
  private installSession(session: FamilySession) {
    const context = this.getContext?.();
    if (this.getContext && (!context || contextKey(context) !== contextKey(session))) throw staleContext();
    const scope = contextKey(session, context?.source);
    if (this.scope !== null && this.scope !== scope) this.clear();
    if (this.scope !== scope) {
      this.scope = scope;
      this.view = new FamilyViews(
        new FamilyIdentityRegistry(session.userId, typeof localStorage === 'undefined' ? undefined : localStorage)
      );
    }
  }
  acceptSession(session: FamilySession) {
    this.refreshContext();
    this.installSession(session);
    this.sessionTask = Promise.resolve(session);
  }
  clear() {
    this.generation++;
    this.tripEpochs.clear();
    this.layerEpochs.clear();
    this.resourceTasks.clear();
    this.bookingRecords.clear();
    this.transportRecords.clear();
    clearFamilyReads();
    this.cores.clear();
    this.policies.clear();
    this.layers.clear();
    this.controllerLayers.clear();
    this.fileReferences.clear();
    this.view = null;
    this.scope = null;
    this.sessionTask = null;
    this.notifyContext();
  }
  knownViews() {
    this.refreshContext();
    return this.view;
  }
  async views() {
    await this.session();
    this.refreshContext();
    if (!this.view) throw staleContext();
    return this.view;
  }
  async tripUuid(value: number | string) {
    return (await this.views()).ids.uuid('trip', value);
  }
  subscribe(fn: (tripId: string) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private invalidateRecords(tripId: string) {
    this.invalidateReservations(tripId);
    this.tripEpochs.set(tripId, (this.tripEpochs.get(tripId) ?? 0) + 1);
    this.cores.delete(tripId);
    this.policies.delete(tripId);
    this.notifyContext(tripId);
  }
  invalidate(tripId: string) {
    this.invalidateRecords(tripId);
    for (const fn of this.listeners) fn(tripId);
  }
  setLayer(tripId: string, layer: WorkspaceItineraryLayer) {
    this.refreshContext();
    if (this.getLayer(tripId) === layer) return;
    this.layers.set(tripId, layer);
    this.layerEpochs.set(tripId, (this.layerEpochs.get(tripId) ?? 0) + 1);
    this.invalidateRecords(tripId);
    this.controllerLayers.get(tripId)?.(layer);
  }
  claimPlannerController() {
    this.plannerControllerClaims++;
    this.cores.clear();
    this.policies.clear();
    this.controllerLayers.clear();
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.plannerControllerClaims--;
        this.cores.clear();
        this.policies.clear();
        this.controllerLayers.clear();
      }
    };
  }
  attachController(
    core: FamilyCore,
    policy: { canMutate: boolean; outcomes: Record<string, permissions.FamilyPermissionOutcome> },
    layer: WorkspaceItineraryLayer,
    setLayer: (layer: WorkspaceItineraryLayer) => void
  ) {
    this.refreshContext();
    if (this.plannerControllerClaims > 0) return () => {};
    const task = Promise.resolve(core);
    this.cores.set(core.trip.id, task);
    this.policies.set(core.trip.id, Promise.resolve(policy));
    this.layers.set(core.trip.id, layer);
    this.controllerLayers.set(core.trip.id, setLayer);
    return () => {
      if (this.cores.get(core.trip.id) === task) {
        this.cores.delete(core.trip.id);
        this.policies.delete(core.trip.id);
        this.controllerLayers.delete(core.trip.id);
      }
    };
  }
  getLayer(tripId: string) {
    this.refreshContext();
    return this.layers.get(tripId) ?? 'published';
  }
  async core(value: number | string): Promise<FamilyCore> {
    const context = await this.tripContext(value),
      { tripId } = context;
    context.assertCurrent();
    let task = this.cores.get(tripId);
    if (task === undefined) {
      task = context
        .perform(() =>
          Promise.all([
            this.readers.trips.fetchTripById(tripId),
            this.readers.days.listTripDays(tripId),
            this.readers.places.listTripPlaces(tripId),
            this.readers.schedule.listScheduleItems(tripId),
            this.readers.notes.listDayNotes(tripId),
          ])
        )
        .then(([trip, days, places, schedule, notes]) => {
          context.assertCurrent();
          if (!trip) throw new FamilyApiError(404, 'trip_unavailable', 'This trip is unavailable.');
          return { trip, days, places, schedule, notes };
        });
      this.cores.set(tripId, task);
      const pending = task;
      void pending.catch(() => {
        if (this.cores.get(tripId) === pending) this.cores.delete(tripId);
      });
    }
    const currentTask = task;
    return context.perform(() => currentTask);
  }
  async policy(tripId: string) {
    const context = await this.tripContext(tripId);
    context.assertCurrent();
    let pending = this.policies.get(tripId);
    if (pending === undefined) {
      pending = context
        .perform(() =>
          Promise.all([
            this.readers.capabilities.canMutateTrip(tripId),
            this.readers.permissions.listTripActionOutcomes(tripId),
          ])
        )
        .then(([canMutate, p]) => ({ canMutate, outcomes: p.outcomes }));
      this.policies.set(tripId, pending);
      const task = pending;
      void task.catch(() => {
        if (this.policies.get(tripId) === task) this.policies.delete(tripId);
      });
    }
    const currentTask = pending;
    return context.perform(() => currentTask);
  }
  async mode(tripId: string, key: string) {
    const context = await this.tripContext(tripId);
    const policy = await context.perform(() => this.policy(tripId));
    return writeModeForCapability({
      layer: this.getLayer(tripId),
      outcome: policy.outcomes[key] ?? 'deny',
      key,
      isHof: policy.canMutate,
    });
  }
  async write<T>(tripId: string, key: string, direct: () => Promise<T>, draft?: () => Promise<T>): Promise<T> {
    const context = await this.tripContext(tripId);
    const mode = await context.perform(() => this.mode(tripId, key));
    if (mode === 'direct') {
      const value = await context.perform(direct);
      this.invalidate(tripId);
      return value;
    }
    if (mode === 'draft' && draft) return context.perform(draft);
    throw new FamilyApiError(
      403,
      mode === 'nudge' ? 'draft_required' : 'action_denied',
      mode === 'nudge'
        ? 'Switch to My draft to propose this change.'
        : 'This action is unavailable for your Family permissions.'
    );
  }
  async stage(input: changes.UpsertTripChangeDraftOpInput) {
    const context = await this.tripContext(input.tripId);
    return context.perform(() => changes.upsertTripChangeDraftOp(input));
  }
  /** Canonical membership/header read; never loads the legacy city/day/schedule aggregate. */
  async tripHeader(value: number | string) {
    const context = await this.tripContext(value),
      session = await this.session();
    const trip = await context.perform(() => this.readers.trips.fetchTripById(context.tripId));
    if (!trip || trip.id !== context.tripId || trip.family_id !== session.familyId)
      throw new FamilyApiError(403, 'trip_scope_unavailable', 'This Trip is unavailable in the current Family.');
    return trip;
  }
  async trip(value: number | string) {
    const context = await this.tripContext(value),
      v = context.views;
    const c = await context.perform(() => this.core(value));
    return { trip: v.trip(c.trip) };
  }
  async listTrips(archived = false) {
    const session = await this.session(),
      context = this.captureContext(),
      v = await context.perform(() => this.views());
    const all = await context.perform(() => this.readers.trips.listFamilyTrips(session.familyId));
    return { trips: (archived ? all.archivedTrips : all.trips).map((t) => v.trip(t)) };
  }
  async dayList(value: number | string) {
    const context = await this.tripContext(value),
      v = context.views;
    const c = await context.perform(() => this.core(value));
    return { days: v.days(c.days, c.schedule, c.notes, c.places) };
  }
  async placeList(value: number | string) {
    const context = await this.tripContext(value),
      v = context.views;
    const c = await context.perform(() => this.core(value));
    return { places: c.places.map((p) => v.place(c.trip.id, p)) };
  }
  private async resource<T>(tripId: string, kind: FamilyResource, load: () => Promise<T>, variant = ''): Promise<T> {
    const context = this.captureContext(tripId),
      epoch = this.tripEpochs.get(tripId) ?? 0,
      key = `${tripId}:${kind}:${variant}:${epoch}`;
    const existing = this.resourceTasks.get(key);
    if (existing !== undefined) return existing as Promise<T>;
    setFamilyRead(tripId, kind, 'loading');
    const task: Promise<T> = context
      .perform(load)
      .then(
        (value) => {
          context.assertCurrent();
          setFamilyRead(tripId, kind, 'ready');
          return value;
        },
        (error) => {
          context.assertCurrent();
          setFamilyRead(tripId, kind, 'error', error);
          throw error;
        }
      )
      .finally(() => {
        if (this.resourceTasks.get(key) === task) this.resourceTasks.delete(key);
      });
    this.resourceTasks.set(key, task);
    return task;
  }
  invalidateReservations(tripId: string) {
    this.bookingRecords.delete(tripId);
    this.transportRecords.delete(tripId);
  }
  async canonicalBookings(tripId: string) {
    const context = await this.tripContext(tripId);
    context.assertCurrent();
    let task = this.bookingRecords.get(tripId);
    if (task === undefined) {
      task = context.perform(() => this.readers.reservations.listTripBookings(tripId));
      this.bookingRecords.set(tripId, task);
      void task.catch(() => {
        if (this.bookingRecords.get(tripId) === task) this.bookingRecords.delete(tripId);
      });
    }
    const currentTask = task;
    return context.perform(() => currentTask);
  }
  async canonicalTransports(tripId: string) {
    const context = await this.tripContext(tripId);
    context.assertCurrent();
    let task = this.transportRecords.get(tripId);
    if (task === undefined) {
      task = context.perform(() => this.readers.reservations.listTripTransports(tripId));
      this.transportRecords.set(tripId, task);
      void task.catch(() => {
        if (this.transportRecords.get(tripId) === task) this.transportRecords.delete(tripId);
      });
    }
    const currentTask = task;
    return context.perform(() => currentTask);
  }
  async reservationList(value: number | string) {
    const context = await this.tripContext(value),
      { tripId } = context;
    context.assertCurrent();
    return this.resource(tripId, 'reservations', async () => {
      const [a, b, v, core] = await Promise.all([
        this.canonicalBookings(tripId),
        this.canonicalTransports(tripId),
        this.views(),
        this.core(tripId),
      ]);
      context.assertCurrent();
      return { reservations: [...a, ...b].map((r) => v.reservation(r, core.days)) };
    });
  }
  async expenseList(value: number | string) {
    const context = await this.tripContext(value),
      { tripId } = context;
    context.assertCurrent();
    return this.resource(tripId, 'expenses', async () => {
      const [rows, v, travelers] = await Promise.all([
        this.readers.expenses.listTripExpenses(tripId),
        this.views(),
        this.readers.listTripTravelers(tripId),
      ]);
      context.assertCurrent();
      const names = new Map(travelers.map((t) => [t.personId, t.displayName]));
      return { items: rows.map((r) => v.expense(r, names)) };
    });
  }
  async fileList(value: number | string, trash = false) {
    const context = await this.tripContext(value),
      { tripId } = context;
    context.assertCurrent();
    return this.resource(
      tripId,
      'files',
      async () => {
        const [rows, v] = await Promise.all([this.readers.files.listTripFiles(tripId, { trash }), this.views()]);
        context.assertCurrent();
        for (const row of rows) this.fileReferences.set(row.id, { tripId, storagePath: row.storagePath });
        return { files: rows.map((r) => v.file(r)) };
      },
      String(trash)
    );
  }
  async observeFile(key: number | string) {
    const context = this.captureContext(),
      v = this.knownViews();
    if (!v) throw new FamilyApiError(404, 'file_unavailable', 'Reload the file list before opening this file.');
    const uuid = v.ids.uuid('file', key);
    const ref = this.fileReferences.get(uuid);
    if (!ref) throw new FamilyApiError(404, 'file_unavailable', 'Reload the file list before opening this file.');
    const tripContext = this.captureContext(ref.tripId);
    const perform = <T>(operation: () => Promise<T>) => context.perform(() => tripContext.perform(operation));
    const rows = await perform(() => this.readers.files.listTripFiles(ref.tripId));
    const row = rows.find((r) => r.id === uuid && r.tripId === ref.tripId && !r.deletedAt);
    if (!row) throw new FamilyApiError(404, 'file_unavailable', 'This file is unavailable.');
    return {
      row,
      perform,
      assertCurrent: () => {
        context.assertCurrent();
        tripContext.assertCurrent();
      },
    };
  }
  async resolveFileUrl(key: number | string) {
    const observation = await this.observeFile(key);
    return observation.perform(() => this.readers.files.signedTripFileUrl(observation.row.storagePath, 120));
  }
  async members(value: number | string) {
    const context = await this.tripContext(value),
      { tripId, views: v } = context;
    const rows = await context.perform(() => this.readers.listTripTravelers(tripId));
    return {
      members: rows.map((m) => ({
        id: v.ids.register('person', m.personId),
        username: m.displayName,
        color: m.color,
      })),
    };
  }
  async categories() {
    const session = await this.session(),
      context = this.captureContext(),
      v = await context.perform(() => this.views());
    const rows = await context.perform(() => this.readers.listMemberFamilyPlaceCategories(session.familyId));
    return {
      categories: rows.map((c) => ({
        id: v.ids.register('category', c.id),
        name: c.name,
        color: c.colorHex,
        icon: c.iconKey,
      })),
    };
  }
}

export const familyFrontend = new FamilyFrontendRepository();
// Observe every actual actor/gate transition, including A -> B -> A before a request finishes.
// Cosmetic user updates and token refreshes with the same actor do not change the owner.
useAuthStore.subscribe(() => familyFrontend.refreshContext());
