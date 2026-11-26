import type { PlannerStayRead } from '../../repo/plannerReadPort';
import { useTripStore, type TripStoreState } from '../../store/tripStore';
import { captureReadSession, type ReadSession } from '../../sync/readSession';
import { withdrawCoherentPlannerBundle } from './coherentPlannerBundle';
import { nativeStayCommandQualificationEnabled } from './coherentStayQualification';
import { checkedNativeStayView, type NativeStayView } from './nativeStayReadContract';
import type { OriginalStayPreparedRefresh } from './originalStayCommandSession';
import type { PlannerBoundaryOwner, PlannerReadProblem } from './plannerBoundaryOwner';
import type { createPlannerBundle } from './plannerCohortBundle';
import { createPlannerCommandRecovery } from './plannerCommandRecovery';
import { guardedPlannerRead, type PlannerReadGuard } from './plannerReadGuard';
import type { createPlannerViewReader } from './plannerView';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';

type Bundle = ReturnType<typeof createPlannerBundle>;
type FullFlight = {
  original: boolean;
  published: boolean;
  trip: string;
  current: () => boolean;
  promise: Promise<void>;
};
const plannerFields = ['trip', 'places', 'days', 'assignments', 'dayNotes'] as const;
const bundleFields = [
  ...plannerFields,
  'packingItems',
  'todoItems',
  'budgetItems',
  'reservations',
  'files',
  'tags',
  'categories',
] as const;
/** Publish a complete checked read without resetting or replacing unconfirmed local work. */
export class PlannerCohortReads {
  private epoch = 0;
  private stayObservation: { trip: string; read: PlannerStayRead; current: () => boolean } | null = null;
  private fullFlight: FullFlight | null = null;
  private loadedScope: { trip: string; current: () => boolean } | null = null;
  constructor(
    private repo: FamilyFrontendRepository,
    private reader: ReturnType<typeof createPlannerViewReader>,
    private bundle: Bundle,
    private environment: {
      boundary: PlannerBoundaryOwner;
      coherentStays?: boolean;
      disposed: () => boolean;
      source: () => string;
      reset: (keepPackingDrafts?: boolean) => void;
      tasks: (packet: import('./taskContract').TaskList) => void;
      packing?: (
        packet: import('./packingContract').PackingList,
        projection: ReturnType<typeof import('./plannerPacking').projectPacking>,
        categories?: import('./packingCategoryPresentation').PackingCategoryReadPacket
      ) => void;
    }
  ) {}
  cancel() {
    this.loadedScope = null;
    this.stayObservation = null;
    this.epoch++;
    this.environment.boundary.pause();
    this.environment.boundary.setProblem(null);
  }
  private blocked() {
    return new FamilyApiError(
      409,
      'planner_local_work',
      'Planner refresh is held to preserve local work. Resolve pending commands or retry after editing.'
    );
  }
  private unchanged(before: TripStoreState, keys: readonly (keyof TripStoreState)[]) {
    if (keys.some((key) => useTripStore.getState()[key] !== before[key])) throw this.blocked();
  }
  private tripKey(value: number | string) {
    try {
      return this.repo.knownViews()?.ids.uuid('trip', value) ?? String(value);
    } catch {
      return String(value);
    } // The actual reader still validates unresolved selectors.
  }
  private visible(value: number | string) {
    const trip = useTripStore.getState().trip;
    return trip !== null && this.tripKey(trip.id) === this.tripKey(value);
  }
  private owner(value: number | string, token: number) {
    const privateSession = captureReadSession(),
      source = this.environment.source(),
      trip = this.tripKey(value),
      context = this.repo.captureContext(/^[0-9a-f-]{36}$/.test(trip) ? trip : undefined, { revision: false });
    const sameScope = () => {
      try {
        privateSession.assertCurrent();
        context.assertCurrent();
        return !this.environment.disposed() && source === this.environment.source();
      } catch {
        return false;
      }
    };
    const current = () => token === this.epoch && sameScope();
    return { privateSession, trip, current, sameScope };
  }
  private report(
    owner: ReturnType<PlannerCohortReads['owner']>,
    error: unknown,
    retry: () => Promise<void>,
    loading: boolean
  ) {
    if (!owner.current()) return;
    const message = error instanceof Error ? error.message : 'Planner unavailable';
    if (loading) useTripStore.setState({ isLoading: false, error: message });
    const problem: PlannerReadProblem = {
      trip: owner.trip,
      message,
      current: owner.current,
      retry: () => {
        if (this.environment.boundary.getProblem() !== problem || !owner.current())
          return Promise.reject(this.blocked());
        return retry();
      },
    };
    if (error instanceof FamilyApiError && error.code === 'planner_local_work') {
      problem.taskRecovery = createPlannerCommandRecovery(this.repo, owner.trip, {
        source: this.environment.source,
        current: () => owner.current() && this.environment.boundary.getProblem() === problem,
        prepareCurrent: (current, guard) => this.prepareNativeRecovery(owner, problem, current, guard),
      });
    }
    this.environment.boundary.setProblem(problem);
  }
  /** Live change notices may retire a snapshot after our own save. Retry only
   * that read under the original private/layer context, never a command.
   */
  private async read<T>(
    owner: ReadSession,
    value: number | string,
    work: (guard: PlannerReadGuard, check: () => void, publish: () => void) => Promise<T>,
    inherited?: PlannerReadGuard
  ): Promise<T> {
    await this.repo.session();
    const trip = await this.repo.tripUuid(value);
    const original = this.repo.captureContext(trip, { revision: false });
    const origin = this.environment.source();
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.readOnce(owner, value, work, inherited);
      } catch (error) {
        if (inherited || attempt >= 2 || !(error instanceof FamilyApiError) ||
            !['stale_read', 'stale_planner_view', 'planner_bundle_changed'].includes(error.code)) throw error;
        owner.assertCurrent();
        original.assertCurrent();
        if (this.environment.disposed() || this.environment.source() !== origin) throw error;
        // Fresh guards still check pending commands and unchanged local store fields.
      }
    }
  }
  private async readOnce<T>(
    owner: ReadSession,
    value: number | string,
    work: (guard: PlannerReadGuard, check: () => void, publish: () => void) => Promise<T>,
    inherited?: PlannerReadGuard
  ) {
    const session = await this.repo.session(),
      trip = await this.repo.tripUuid(value),
      ids = (await this.repo.views()).ids,
      context = this.repo.captureContext(trip),
      layer = this.repo.getLayer(trip),
      origin = this.environment.source();
    const check = () => {
      owner.assertCurrent();
      context.assertCurrent();
      if (
        this.environment.disposed() ||
        this.environment.source() !== origin ||
        this.repo.getLayer(trip) !== layer ||
        ids !== this.repo.knownViews()?.ids
      )
        throw this.blocked();
    };
    const fence = async () => {
      check();
      const current = await this.repo.session();
      if (
        current.userId !== session.userId ||
        current.personId !== session.personId ||
        current.familyId !== session.familyId
      )
        throw this.blocked();
      check();
    };
    await fence();
    return guardedPlannerRead(
      owner,
      { uuid: trip, native: ids.register('trip', trip) },
      () => this.blocked(),
      async (guard) => {
        const result = await work(guard, check, () =>
          this.environment.boundary.publish(trip, session, ids, layer, check)
        );
        await fence();
        return result;
      },
      inherited
    );
  }
  load(value: number | string) {
    return this.full(value, true);
  }
  private rememberLoadedScope(owner: ReturnType<PlannerCohortReads['owner']>) {
    if (!owner.current() || !this.visible(owner.trip)) return;
    const ids = this.repo.knownViews()?.ids,
      layer = this.repo.getLayer(owner.trip);
    this.loadedScope = {
      trip: owner.trip,
      current: () =>
        owner.sameScope() &&
        this.visible(owner.trip) &&
        ids === this.repo.knownViews()?.ids &&
        layer === this.repo.getLayer(owner.trip),
    };
  }
  hydrate(value: number | string) {
    return this.full(value, false);
  }
  /** Original-command completion only. Cold recovery remains held until its publication handoff is qualified. */
  hydrateNativeStay(current: NativeStayView, guard: PlannerReadGuard) {
    if (
      !nativeStayCommandQualificationEnabled() ||
      !this.environment.coherentStays ||
      !this.visible(current.core.trip_id)
    )
      return Promise.reject(this.blocked());
    const ids = this.repo.knownViews()?.ids;
    if (!ids) return Promise.reject(this.blocked());
    guard.assertTrip({ uuid: current.core.trip_id, native: ids.register('trip', current.core.trip_id) });
    return this.confirmNativeStay(current, guard);
  }
  private async confirmNativeStay(current: NativeStayView, guard: PlannerReadGuard) {
    const session = await this.repo.session();
    const checked = checkedNativeStayView(current, {
      trip_id: current.core.trip_id,
      family_id: session.familyId,
      person_id: session.personId,
      user_id: session.userId,
    });
    return this.full(checked.core.trip_id, false, { guard, revision: checked.core.trip_revision });
  }
  /** Startup's stays read and reconnect hydration join the same complete original observation. */
  private full(
    value: number | string,
    loading: boolean,
    original?: { guard: PlannerReadGuard; revision: number }
  ): Promise<void> {
    const prior = this.fullFlight;
    if (prior?.current() && prior.original && (!loading || prior.trip === this.tripKey(value)))
      return Promise.reject(this.blocked());
    if (!loading && prior?.current() && !prior.published) {
      if (!original && !prior.original && prior.trip === this.tripKey(value)) return prior.promise;
      return Promise.reject(this.blocked());
    }
    if (!loading && !this.visible(value)) return Promise.reject(this.blocked());
    // Keep the native phone sheets mounted for a previously served private
    // scope. This is display continuity, never permission to skip a fresh read.
    const warm = this.loadedScope,
      cold = loading && !(warm?.trip === this.tripKey(value) && warm.current());
    if (cold) this.loadedScope = null;
    const token = ++this.epoch,
      owner = this.owner(value, token),
      before = useTripStore.getState();
    let result: Awaited<ReturnType<Bundle>> | undefined;
    const flight: FullFlight = {
      original: original !== undefined,
      published: false,
      trip: owner.trip,
      current: owner.current,
      promise: Promise.resolve(),
    };
    // The slot is installed before running work; re-entrant subscribers cannot start a second full publication.
    this.fullFlight = flight;
    flight.promise = Promise.resolve()
      .then(() =>
        this.read(
          owner.privateSession,
          value,
          async (guard, check, publish) => {
            const bundle = await this.bundle(value, undefined, guard);
            result = bundle;
            if (
              original &&
              (!bundle.familyStayProjection || bundle.trip.family_calendar.trip_revision < original.revision)
            )
              throw this.blocked();
            await guard.commit(() => {
              check();
              this.publishComplete(bundle, owner, before, publish, { loading, cold });
              flight.published = true;
            });
          },
          original?.guard
        )
      )
      .catch(async (error) => {
        if (result) await withdrawCoherentPlannerBundle(result);
        this.report(owner, error, () => (loading ? this.load(value) : this.hydrate(value)), cold);
        throw error;
      })
      .finally(() => {
        if (this.fullFlight === flight) this.fullFlight = null;
      });
    this.environment.boundary.pause();
    this.environment.boundary.setProblem(null);
    if (cold) useTripStore.setState({ isLoading: true, error: null });
    return flight.promise;
  }
  private publishComplete(
    bundle: Awaited<ReturnType<Bundle>>,
    owner: ReturnType<PlannerCohortReads['owner']>,
    before: TripStoreState,
    publish: () => void,
    mode: { loading: boolean; cold: boolean }
  ) {
    const { loading, cold } = mode;
    if (!owner.current())
      throw new FamilyApiError(409, 'planner_load_superseded', 'A newer Trip load replaced this one.');
    if (!loading && String(useTripStore.getState().trip?.id) !== String(bundle.trip.id)) throw this.blocked();
    this.unchanged(before, bundleFields);
    if (loading) {
      this.environment.reset(!cold);
      if (cold) useTripStore.getState().resetTrip();
    }
    this.stayObservation = bundle.familyStayProjection
      ? {
          trip: owner.trip,
          read: { ...bundle.familyStayProjection, reservations: bundle.reservations },
          current: () =>
            owner.sameScope() && this.visible(owner.trip) && this.repo.getLayer(owner.trip) === 'published',
        }
      : null;
    publishBundle(bundle);
    if (!owner.current())
      throw new FamilyApiError(409, 'planner_load_superseded', 'A newer Trip load replaced this one.');
    this.environment.tasks(bundle.familyTaskSnapshot);
    this.environment.packing?.(
      bundle.familyPackingSnapshot,
      bundle.familyPackingProjection,
      bundle.familyPackingCategorySnapshot
    );
    publish();
    this.rememberLoadedScope(owner);
  }
  private async prepareNativeRecovery(
    owner: ReturnType<PlannerCohortReads['owner']>,
    problem: PlannerReadProblem,
    current: NativeStayView,
    guard: PlannerReadGuard
  ): Promise<OriginalStayPreparedRefresh> {
    const before = useTripStore.getState();
    const check = () => {
      if (
        !nativeStayCommandQualificationEnabled() ||
        !this.environment.coherentStays ||
        !owner.current() ||
        this.environment.boundary.getProblem() !== problem ||
        current.core.trip_id !== owner.trip ||
        (before.trip !== null && this.tripKey(before.trip.id) !== owner.trip)
      )
        throw this.blocked();
    };
    check();
    if (this.fullFlight?.current()) throw this.blocked();
    const session = await this.repo.session();
    check();
    const checked = checkedNativeStayView(current, {
      trip_id: owner.trip,
      family_id: session.familyId,
      person_id: session.personId,
      user_id: session.userId,
    });
    let result: Awaited<ReturnType<Bundle>> | undefined;
    let settled = false;
    const flight: FullFlight = {
      original: true,
      published: false,
      trip: owner.trip,
      current: owner.current,
      promise: Promise.resolve(),
    };
    this.fullFlight = flight;
    const release = () => {
      if (this.fullFlight === flight) this.fullFlight = null;
    };
    const discard = async () => {
      if (settled) return;
      settled = true;
      release();
      if (result) await withdrawCoherentPlannerBundle(result);
      if (owner.current() && this.environment.boundary.getProblem() === problem) {
        this.environment.boundary.pause();
        if (flight.published) this.stayObservation = null;
      }
    };
    try {
      const publication = await this.read(
        owner.privateSession,
        owner.trip,
        async (inherited, readCheck, publish) => {
          const bundle = await this.bundle(owner.trip, undefined, inherited);
          result = bundle;
          check();
          readCheck();
          if (!bundle.familyStayProjection || bundle.trip.family_calendar.trip_revision < checked.core.trip_revision)
            throw this.blocked();
          this.unchanged(before, bundleFields);
          return () => {
            check();
            readCheck();
            if (settled || flight.published) throw this.blocked();
            this.publishComplete(bundle, owner, before, publish, {
              loading: before.trip === null,
              cold: before.trip === null,
            });
            flight.published = true;
          };
        },
        guard
      );
      check();
      return {
        publish: publication,
        complete: () => {
          if (settled) return;
          settled = true;
          release();
          if (owner.current() && this.environment.boundary.getProblem() === problem) {
            this.epoch++; // Retire old inspectors/retry callbacks only once publication and acknowledgement both succeeded.
            this.environment.boundary.setProblem(null);
          }
        },
        discard,
      };
    } catch (error) {
      await discard();
      throw error;
    }
  }
  currentStays(value: number | string): PlannerStayRead | undefined {
    const observed = this.stayObservation;
    if (
      !observed ||
      observed.trip !== this.tripKey(value) ||
      !observed.current() ||
      useTripStore.getState().reservations !== observed.read.reservations
    )
      return undefined;
    return observed.read;
  }
  async stays(value: number | string): Promise<PlannerStayRead> {
    if (!this.environment.coherentStays) throw this.blocked();
    await this.hydrate(value);
    const current = this.currentStays(value);
    if (!current) throw this.blocked();
    return current;
  }
  async refresh(value: number | string) {
    if (this.environment.coherentStays) return this.hydrate(value);
    const flight = this.fullFlight;
    if (flight?.current() && !flight.published) {
      if (flight.trip === this.tripKey(value)) return flight.promise;
      throw this.blocked();
    }
    if (!this.visible(value)) throw this.blocked();
    const owner = this.owner(value, ++this.epoch),
      before = useTripStore.getState();
    this.environment.boundary.pause();
    this.environment.boundary.setProblem(null);
    try {
      await this.read(owner.privateSession, value, async (guard, check, publish) => {
        const trip = await this.repo.tripUuid(value),
          ids = (await this.repo.views()).ids,
          view = await this.reader.read(trip, this.repo.getLayer(trip), undefined, guard);
        await guard.commit(() => {
          check();
          if (!owner.current() || String(useTripStore.getState().trip?.id) !== String(ids.register('trip', trip)))
            throw this.blocked();
          this.unchanged(before, plannerFields);
          useTripStore.setState(plannerStoreFields(view.state.native.places, view.state.native.days));
          publish();
        });
      });
    } catch (error) {
      this.report(owner, error, () => this.refresh(value), false);
      throw error;
    }
  }
}
function plannerStoreFields(places: TripStoreState['places'], days: TripStoreState['days']) {
  const assignments = Object.fromEntries(days.map((d) => [String(d.id), d.assignments ?? []])),
    dayNotes = Object.fromEntries(days.map((d) => [String(d.id), d.notes_items ?? []]));
  return { places, days, assignments, dayNotes };
}
function publishBundle(b: Awaited<ReturnType<Bundle>>) {
  const {
      days,
      places,
      familyStayProjection: _stays,
      familyTaskSnapshot: _taskSnapshot,
      familyPackingSnapshot: _packingSnapshot,
      familyPackingCategorySnapshot: _packingCategories,
      familyPackingProjection: _packingProjection,
      ...other
    } = b,
    selected = useTripStore.getState().selectedDayId;
  useTripStore.setState({
    ...other,
    ...plannerStoreFields(places, days),
    selectedDayId: days.some((d) => d.id === selected) ? selected : null,
    isLoading: false,
    error: null,
  });
}
