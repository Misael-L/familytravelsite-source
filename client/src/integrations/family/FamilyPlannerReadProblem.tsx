import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from '../../i18n';
import { useTripStore } from '../../store/tripStore';
import { FamilyPlannerTaskRecovery } from './FamilyPlannerTaskRecovery';
import {
  currentPlannerBoundaryOwner,
  type PlannerBoundaryOwner,
  type PlannerReadProblem,
} from './plannerBoundaryOwner';

export function FamilyPlannerReadProblem({ owner }: { owner: PlannerBoundaryOwner }) {
  const problem = useSyncExternalStore(owner.subscribe, owner.getProblem, owner.getProblem),
    { id } = useParams();
  let trip: string | undefined;
  try {
    trip = id && owner.repository.knownViews()?.ids.uuid('trip', id);
  } catch {
    trip = id;
  }
  if (!problem || problem.trip !== trip || currentPlannerBoundaryOwner() !== owner) return null;
  return <ReadProblem key={problem.trip} owner={owner} problem={problem} />;
}
function ReadProblem({ owner, problem }: { owner: PlannerBoundaryOwner; problem: PlannerReadProblem }) {
  const { id } = useParams(),
    { t } = useTranslation(),
    hasTrip = useTripStore((s) => String(s.trip?.id) === id),
    mounted = useRef(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const retry = async () => {
    if (busy || !mounted.current || owner.getProblem() !== problem || currentPlannerBoundaryOwner() !== owner) return;
    setBusy(true);
    try {
      await problem.retry();
    } catch {
      /* The owned read publishes its new failure, without losing local work. */
    } finally {
      if (mounted.current && owner.getProblem() === problem) setBusy(false);
    }
  };
  return (
    <div
      role="alert"
      className={
        hasTrip
          ? 'fixed inset-x-3 top-24 z-[var(--z-toast)] mx-auto max-w-xl rounded-xl border border-edge bg-surface-card p-4 text-content shadow-lg'
          : 'fixed inset-0 z-[var(--z-toast)] flex items-center justify-center bg-surface p-6 text-content'
      }
    >
      <div className="flex max-w-xl flex-col gap-3">
        <p>{problem.message}</p>
        {problem.taskRecovery && (
          <FamilyPlannerTaskRecovery key={problemIdentity(problem)} problem={problem} recovery={problem.taskRecovery} />
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void retry();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-accent-text disabled:opacity-50"
        >
          <RefreshCw size={16} />
          {busy ? t('common.loading') : t('trip.load.retry')}
        </button>
      </div>
    </div>
  );
}

const problemIds = new WeakMap<PlannerReadProblem, number>();
let nextProblemId = 0;
function problemIdentity(problem: PlannerReadProblem) {
  let id = problemIds.get(problem);
  if (id === undefined) {
    id = ++nextProblemId;
    problemIds.set(problem, id);
  }
  return id;
}
