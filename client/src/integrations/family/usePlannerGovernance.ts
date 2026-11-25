import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { GovernanceRead, PlannerGovernancePort } from '../../repo/plannerGovernancePort';
import type { GovernanceCommand, GovernanceGroup } from './governanceContract';
import {
  canInspectGovernance,
  canReviewGovernance,
  governanceDisplay,
  governanceRequestOps,
} from './governanceProjection';
import type { UseFamilyTripWorkspaceGovernanceResult } from './legacy/pages/familyTripWorkspace/useFamilyTripWorkspaceGovernance';
import {
  resolveWorkspaceWriteMode,
  writeModeForCapability,
} from './legacy/pages/familyTripWorkspace/workspaceGovernanceModel';
type Options = {
  tripId: string;
  personId: string | null;
  enabled: boolean;
  readKey?: unknown;
  layer?: 'published' | 'myDraft';
};
/** Native governance controls read complete typed proposals and retain their original confirmation contexts. */
export function usePlannerGovernance(
  opts: Options,
  port: PlannerGovernancePort | null
): UseFamilyTripWorkspaceGovernanceResult {
  const [result, setResult] = useState<{
      trip: string;
      port: PlannerGovernancePort | null;
      readKey?: unknown;
      view: GovernanceRead;
    } | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0),
    sequence = useRef(0),
    proposal = useRef<{ view: GovernanceRead; group: GovernanceGroup } | null>(null),
    loaded = useRef(new Map<string, { view: GovernanceRead; group: GovernanceGroup }>());
  const view = visibleGovernance(result, opts, port);
  const reload = useCallback(async () => {
    if (!port || !opts.enabled) return;
    const token = epoch.current,
      serial = ++sequence.current;
    try {
      const next = await port.read(opts.tripId);
      if (token !== epoch.current || serial !== sequence.current) return;
      assertGovernanceScope(next, opts.personId, opts.layer);
      setResult({ trip: opts.tripId, port, readKey: opts.readKey, view: next });
      setError(null);
    } catch (e) {
      if (token === epoch.current && serial === sequence.current) {
        setResult(null);
        setError(e instanceof Error ? e.message : 'Governance unavailable.');
      }
    }
  }, [opts.tripId, opts.enabled, opts.personId, opts.readKey, opts.layer, port]);
  useEffect(() => {
    const token = ++epoch.current;
    proposal.current = null;
    loaded.current.clear();
    void Promise.resolve().then(() => {
      if (epoch.current === token) void reload();
    });
    return () => {
      epoch.current = token + 1;
    };
  }, [reload]);
  const command: GovernanceCommandWriter = (action, target, ctx, parameters) =>
    executeGovernanceCommand(
      { port, tripId: opts.tripId, epoch, setBusy, setError, reload },
      { action, target, ctx, parameters }
    );
  const unsupported = async () => {
    setError('This legacy governance writer is not connected. Original work is retained.');
    return false;
  };
  const display = view
    ? governanceDisplay(view)
    : { changeDraft: null, draftOps: [], openChangeRequests: [], mySubmittedRequests: [] };
  const layer = view?.scope.layer ?? 'published',
    canMutate = view?.permissions.can_mutate ?? false,
    canDraft = view?.permissions.can_draft ?? false;
  const mode = resolveWorkspaceWriteMode({ layer, canMutate, canDraft });
  const loadRequestOps = useCallback(
    async (id: string) => {
      if (!port) throw new Error('Planner governance session ended.');
      const token = epoch.current,
        next = await port.read(opts.tripId);
      if (token !== epoch.current) throw new Error('Governance session changed.');
      const group = next.requests.find((q) => q.record.id === id);
      if (!group) {
        if (loaded.current.has(id)) {
          loaded.current.delete(id);
          return [];
        }
        throw new Error('Request no longer available.');
      }
      loaded.current.set(id, { view: next, group });
      return governanceRequestOps(group);
    },
    [opts.tripId, port]
  );
  const canReviewOp = (id: string) =>
    Boolean(view?.requests.some((q) => q.operations.some((o) => o.id === id && canReviewGovernance(view, o))));
  const canReviewRequest = (id: string) =>
    Boolean(
      view?.requests.some(
        (q) =>
          q.record.id === id &&
          q.operations.filter((o) => o.status === 'pending').every((o) => canReviewGovernance(view, o))
      )
    );
  return {
    ...display,
    canReview: view?.requests.some((q) => q.operations.some((o) => canInspectGovernance(view, o))) ?? false,
    canReviewOp,
    canReviewRequest,
    layer,
    setLayer: layerChanger(() => ({ port, tripId: opts.tripId, epoch, setBusy, setError, reload })),
    canMutate,
    canDraft,
    canEditPublished: layer === 'published' && canMutate,
    canStageDraft: layer === 'myDraft' && canDraft,
    writeMode: mode,
    writeModeFor: (key) =>
      writeModeForCapability({ layer, outcome: view?.permissions.outcomes[key] ?? 'deny', key, isHof: canMutate }),
    actionOutcomes: view?.permissions.outcomes ?? {},
    canUseEditors: mode === 'direct' || mode === 'draft',
    isChangeBusy: busy,
    governanceError: error,
    mutateGateError: !view,
    reloadChangeGovernance: reload,
    ...governanceCallbacks(() => ({ view, proposal, loaded, command, setError })),
    loadRequestOps,
    addDraftOp: unsupported,
    deleteDraftOp: unsupported,
    withdrawRequest: unsupported,
    nextSortOrder: Math.max(-1, ...display.draftOps.map((o) => o.sortOrder)) + 1,
  };
}

type ReadResult = { trip: string; port: PlannerGovernancePort | null; readKey?: unknown; view: GovernanceRead };
function visibleGovernance(result: ReadResult | null, opts: Options, port: PlannerGovernancePort | null) {
  if (
    !opts.enabled ||
    !result ||
    result.trip !== opts.tripId ||
    result.port !== port ||
    result.readKey !== opts.readKey
  )
    return null;
  return result.view.scope.person_id === opts.personId &&
    (opts.layer === undefined || result.view.scope.layer === opts.layer)
    ? result.view
    : null;
}
function assertGovernanceScope(view: GovernanceRead, person: string | null, layer: Options['layer']) {
  if (view.scope.person_id !== person) throw new Error('The active person changed. Reload governance.');
  if (layer !== undefined && view.scope.layer !== layer)
    throw new Error('The active layer changed. Reload governance.');
}

type ReviewContext = { view: GovernanceRead; group: GovernanceGroup };
type ErrorSetter = Dispatch<SetStateAction<string | null>>;
type GovernanceCommandWriter = (
  action: GovernanceCommand['action'],
  target: string,
  context: ReviewContext,
  parameters: Record<string, unknown>
) => Promise<boolean>;
type GovernanceCallbackContext = {
  view: GovernanceRead | null;
  proposal: RefObject<ReviewContext | null>;
  loaded: RefObject<Map<string, ReviewContext>>;
  command: GovernanceCommandWriter;
  setError: ErrorSetter;
};
function governanceCallbacks(
  context: () => GovernanceCallbackContext
): Pick<
  UseFamilyTripWorkspaceGovernanceResult,
  'beginProposal' | 'proposeDraftChanges' | 'resolveOp' | 'resolveRequest'
> {
  return {
    beginProposal: () => {
      const { view, proposal } = context();
      if (view?.draft) proposal.current = { view, group: structuredClone(view.draft) };
    },
    proposeDraftChanges: async (summary) => {
      const { proposal, command, setError } = context();
      const ctx = proposal.current;
      if (!ctx) {
        setError('Open the original proposal confirmation before submitting.');
        return false;
      }
      const ok = await command('submit', ctx.group.record.id, ctx, { summary: summary ?? null });
      if (ok) proposal.current = null;
      return ok;
    },
    resolveOp: async (id, accept, note) => {
      const { loaded, command, setError } = context();
      const ctx = [...loaded.current.values()].find((c) => c.group.operations.some((o) => o.id === id));
      if (!ctx) {
        setError('Open the original request before reviewing.');
        return { ok: false };
      }
      const op = ctx.group.operations.find((o) => o.id === id);
      if (!op) return { ok: false };
      return {
        ok: await command(
          'review_op',
          id,
          { view: ctx.view, group: { record: ctx.group.record, operations: [op] } },
          { accept, note: note ?? null }
        ),
      };
    },
    resolveRequest: async (id, accept) => {
      const { loaded, command } = context();
      const ctx = loaded.current.get(id);
      return {
        ok: ctx ? await command('review_request', id, ctx, { accept }) : false,
        errorCodes: ctx ? [] : ['request_not_observed'],
      };
    },
  };
}
type LayerChangeContext = {
  port: PlannerGovernancePort | null;
  tripId: string;
  epoch: RefObject<number>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: ErrorSetter;
  reload: () => Promise<void>;
};
function layerChanger(context: () => LayerChangeContext): UseFamilyTripWorkspaceGovernanceResult['setLayer'] {
  return (next) => {
    const { port, tripId, epoch, setBusy, setError, reload } = context();
    if (!port) return;
    const token = epoch.current;
    void (async () => {
      setBusy(true);
      try {
        await port.setLayer(tripId, next);
      } catch (e) {
        if (token === epoch.current) setError(e instanceof Error ? e.message : 'Layer unavailable.');
      } finally {
        if (token === epoch.current) {
          setBusy(false);
          await reload();
        }
      }
    })();
  };
}

async function executeGovernanceCommand(
  { port, tripId, epoch, setBusy, setError, reload }: LayerChangeContext,
  {
    action,
    target,
    ctx,
    parameters,
  }: { action: GovernanceCommand['action']; target: string; ctx: ReviewContext; parameters: Record<string, unknown> }
) {
  if (!port) return false;
  const token = epoch.current;
  setBusy(true);
  try {
    await port.execute(tripId, { action, target, observation: ctx.group, parameters }, ctx.view);
    if (token !== epoch.current) return false;
    await reload();
    return true;
  } catch (e) {
    if (token === epoch.current) setError(e instanceof Error ? e.message : 'Governance command refused.');
    return false;
  } finally {
    if (token === epoch.current) setBusy(false);
  }
}
