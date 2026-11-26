import { useTripStore } from '../../store/tripStore';
import { FamilyPartialLoadBanner } from './FamilyPartialLoadBanner';
import { useFamilyPlannerController } from './plannerControllerContext';
import { readKey, useFamilyReadState, type FamilyResource } from './readState';
import { familyFrontend } from './repository';
import { isFamilyFrontendActive } from './runtime';
export function FamilyExpenseReadStatus() {
  const tripId = useTripStore((s) => s.trip?.id);
  return <ResourceStatus tripId={tripId} resource="expenses" />;
}
function ResourceStatus({ tripId, resource }: { tripId: number | undefined; resource: FamilyResource }) {
  const planner = useFamilyPlannerController();
  const ids = (planner?.owner.repository ?? familyFrontend).knownViews()?.ids;
  let uuid: string | undefined;
  try {
    if (tripId && ids) uuid = ids.uuid('trip', tripId);
  } catch {
    /* A closed trip has no active read. */
  }
  const state = useFamilyReadState((s) => (uuid ? s.reads[readKey(uuid, resource)] : undefined));
  if (!isFamilyFrontendActive() || !state || state.phase === 'ready') return null;
  if (state.phase === 'loading')
    return (
      <p role="status" className="text-body text-content-muted">
        Loading {resource}…
      </p>
    );
  const retry = () => {
    if (!tripId) return;
    const store = useTripStore.getState();
    void (resource === 'expenses'
      ? store.loadBudgetItems(tripId)
      : resource === 'files'
        ? store.loadFiles(tripId)
        : store.loadReservations(tripId));
  };
  return (
    <div role="alert" className="rounded-xl border border-edge bg-surface-card px-3 py-2 text-body text-content">
      <span>
        Could not load {resource}. {state.message}
      </span>{' '}
      <button type="button" className="font-semibold underline" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export function FamilyReadAlerts() {
  const tripId = useTripStore((s) => s.trip?.id);
  return (
    <div
      className="fixed inset-x-0 z-[var(--z-toast)] flex justify-center px-3"
      style={{ top: 'calc(var(--nav-h) + 98px)' }}
    >
      <div className="flex w-full max-w-[560px] flex-col gap-2">
        <FamilyPartialLoadBanner />
        {(['reservations', 'expenses', 'files'] as const).map((resource) => (
          <ErrorOnly key={resource} resource={resource} tripId={tripId} />
        ))}
      </div>
    </div>
  );
}
function ErrorOnly(props: { tripId: number | undefined; resource: FamilyResource }) {
  const state = useFamilyReadState((s) => s.reads);
  const planner = useFamilyPlannerController();
  // The planner read problem owns Retry while a full refresh is unpublished.
  if (props.resource === 'files' && planner?.publication === null) return null;
  const ids = (planner?.owner.repository ?? familyFrontend).knownViews()?.ids;
  let uuid;
  try {
    uuid = props.tripId && ids?.uuid('trip', props.tripId);
  } catch {}
  if (!uuid || state[readKey(uuid, props.resource)]?.phase !== 'error') return null;
  return <ResourceStatus {...props} />;
}
