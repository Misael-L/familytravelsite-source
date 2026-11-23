import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { currentPlannerGovernancePort } from '../../../../../repo/plannerGovernancePort';
import { usePlannerGovernance } from '../../../usePlannerGovernance';
import { usePlannerGovernanceBinding } from '../../../usePlannerGovernanceBinding';
import { canDraftTripChanges, canMutateTrip } from '../../data/supabase/capabilities';
import { listTripActionOutcomes, type FamilyPermissionOutcome } from '../../data/supabase/familyPermissions';
import {
  deleteTripChangeDraftOp,
  fetchMySubmittedTripChangeRequests,
  fetchMyTripChangeDraft,
  fetchOpenTripChangeRequests,
  fetchTripChangeDraftOps,
  fetchTripChangeRequestOps,
  nextDraftSortOrder,
  resolveTripChangeOp,
  resolveTripChangeRequest,
  submitTripChangeRequest,
  upsertTripChangeDraftOp,
  withdrawTripChangeRequest,
  type TripChangeDraftOpRow,
  type TripChangeDraftRow,
  type TripChangeModule,
  type TripChangeOpKind,
  type TripChangeOpPayload,
  type TripChangeRequestOpRow,
  type TripChangeRequestRow,
  type UpsertTripChangeDraftOpInput,
} from '../../data/supabase/tripChangeRequests';
import {
  canUseDraftableEditors,
  canEditPublished as deriveCanEditPublished,
  canStageDraft as deriveCanStageDraft,
  failedResolveCodes,
  resolveWorkspaceWriteMode,
  writeModeForCapability,
  type FamilyActionOutcome,
  type WorkspaceItineraryLayer,
  type WorkspaceWriteMode,
} from './workspaceGovernanceModel';

export type StageDraftOpInput = {
  module: TripChangeModule;
  op: TripChangeOpKind;
  payload: TripChangeOpPayload;
  tripDayId?: string | null;
  civilDate?: string | null;
  targetTable?: string | null;
  targetId?: string | null;
  sortOrder?: number;
};

export type UseFamilyTripWorkspaceGovernanceResult = {
  beginProposal?: () => void;
  canReview?: boolean;
  canReviewOp?: (id: string) => boolean;
  canReviewRequest?: (id: string) => boolean;
  layer: WorkspaceItineraryLayer;
  setLayer: (layer: WorkspaceItineraryLayer) => void;
  canMutate: boolean;
  canDraft: boolean;
  canEditPublished: boolean;
  canStageDraft: boolean;
  writeMode: WorkspaceWriteMode;
  writeModeFor: (key: string) => WorkspaceWriteMode;
  actionOutcomes: Record<string, FamilyPermissionOutcome>;
  canUseEditors: boolean;
  changeDraft: TripChangeDraftRow | null;
  draftOps: TripChangeDraftOpRow[];
  openChangeRequests: TripChangeRequestRow[];
  mySubmittedRequests: TripChangeRequestRow[];
  isChangeBusy: boolean;
  governanceError: string | null;
  mutateGateError: boolean;
  reloadChangeGovernance: () => Promise<void>;
  addDraftOp: (input: StageDraftOpInput) => Promise<boolean>;
  deleteDraftOp: (opId: string) => Promise<boolean>;
  proposeDraftChanges: (summary?: string | null) => Promise<boolean>;
  withdrawRequest: (requestId: string) => Promise<boolean>;
  resolveOp: (
    opId: string,
    accept: boolean,
    note?: string | null
  ) => Promise<{ ok: boolean; errorCode?: string | null }>;
  resolveRequest: (requestId: string, acceptAll: boolean) => Promise<{ ok: boolean; errorCodes: string[] }>;
  loadRequestOps: (requestId: string) => Promise<TripChangeRequestOpRow[]>;
  nextSortOrder: number;
};

function useLegacyGovernance(opts: {
  tripId: string;
  personId: string | null;
  enabled: boolean;
  cohortOwned?: boolean;
  onAfterPublish?: () => Promise<void> | void;
}): UseFamilyTripWorkspaceGovernanceResult {
  const { tripId, personId, enabled, onAfterPublish } = opts;
  const legacyDisabled = useRef(false);
  useLayoutEffect(() => {
    if (opts.cohortOwned) legacyDisabled.current = true;
  }, [opts.cohortOwned]);
  const [layer, setLayer] = useState<WorkspaceItineraryLayer>('published');
  const [canMutate, setCanMutate] = useState(false);
  const [canDraft, setCanDraft] = useState(false);
  const [actionOutcomes, setActionOutcomes] = useState<Record<string, FamilyPermissionOutcome>>({});
  const [changeDraft, setChangeDraft] = useState<TripChangeDraftRow | null>(null);
  const [draftOps, setDraftOps] = useState<TripChangeDraftOpRow[]>([]);
  const [openChangeRequests, setOpenChangeRequests] = useState<TripChangeRequestRow[]>([]);
  const [mySubmittedRequests, setMySubmittedRequests] = useState<TripChangeRequestRow[]>([]);
  const [isChangeBusy, setIsChangeBusy] = useState(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [mutateGateError, setMutateGateError] = useState(false);

  const reloadChangeGovernance = useCallback(async () => {
    if (!tripId || !enabled) return;
    let mutate = false;
    try {
      const [mutateResult, draftable, outcomeMap] = await Promise.all([
        canMutateTrip(tripId),
        canDraftTripChanges(tripId),
        listTripActionOutcomes(tripId),
      ]);
      mutate = mutateResult;
      setCanMutate(mutateResult);
      setCanDraft(draftable);
      setActionOutcomes(outcomeMap.outcomes);
      setMutateGateError(false);
    } catch {
      setCanMutate(false);
      setCanDraft(false);
      setActionOutcomes({});
      setMutateGateError(true);
      setChangeDraft(null);
      setDraftOps([]);
      setOpenChangeRequests([]);
      setMySubmittedRequests([]);
      return;
    }

    try {
      setGovernanceError(null);
      if (!personId) {
        setChangeDraft(null);
        setDraftOps([]);
        setMySubmittedRequests([]);
        setOpenChangeRequests(mutate ? await fetchOpenTripChangeRequests(tripId) : []);
        return;
      }

      const [draft, open, mine] = await Promise.all([
        fetchMyTripChangeDraft(tripId, personId),
        fetchOpenTripChangeRequests(tripId),
        fetchMySubmittedTripChangeRequests(tripId, personId),
      ]);
      setChangeDraft(draft);
      setDraftOps(draft ? await fetchTripChangeDraftOps(draft.id) : []);
      setOpenChangeRequests(open);
      setMySubmittedRequests(mine);
    } catch (err) {
      setGovernanceError(err instanceof Error ? err.message : 'Could not load change requests');
      setDraftOps([]);
      setOpenChangeRequests([]);
      setMySubmittedRequests([]);
    }
  }, [enabled, personId, tripId]);

  useEffect(() => {
    void reloadChangeGovernance();
  }, [reloadChangeGovernance]);

  const writeMode = resolveWorkspaceWriteMode({ layer, canMutate, canDraft });
  const canEditPublished = deriveCanEditPublished({ layer, canMutate });
  const canStage = deriveCanStageDraft({ layer, canDraft });
  const canUseEditors = canUseDraftableEditors(writeMode);
  const writeModeFor = useCallback(
    (key: string): WorkspaceWriteMode => {
      const outcome = (actionOutcomes[key] ?? 'deny') as FamilyActionOutcome;
      return writeModeForCapability({
        layer,
        outcome,
        key,
        isHof: canMutate,
      });
    },
    [actionOutcomes, canMutate, layer]
  );
  const nextSortOrder = useMemo(() => nextDraftSortOrder(draftOps), [draftOps]);

  const addDraftOp = useCallback(
    async (input: StageDraftOpInput): Promise<boolean> => {
      if (!tripId) return false;
      setIsChangeBusy(true);
      try {
        if (legacyDisabled.current || currentPlannerGovernancePort())
          throw new Error('Legacy governance session ended; original work is retained.');
        const payload: UpsertTripChangeDraftOpInput = {
          tripId,
          module: input.module,
          op: input.op,
          payload: input.payload,
          tripDayId: input.tripDayId ?? null,
          civilDate: input.civilDate ?? null,
          targetTable: input.targetTable ?? null,
          targetId: input.targetId ?? null,
          sortOrder: input.sortOrder ?? nextDraftSortOrder(draftOps),
        };
        await upsertTripChangeDraftOp(payload);
        await reloadChangeGovernance();
        return true;
      } catch (err) {
        setGovernanceError(err instanceof Error ? err.message : 'Could not stage this change');
        return false;
      } finally {
        setIsChangeBusy(false);
      }
    },
    [draftOps, reloadChangeGovernance, tripId]
  );

  const deleteDraftOp = useCallback(
    async (opId: string): Promise<boolean> => {
      setIsChangeBusy(true);
      try {
        if (legacyDisabled.current || currentPlannerGovernancePort())
          throw new Error('Legacy governance session ended; original work is retained.');
        await deleteTripChangeDraftOp(opId);
        await reloadChangeGovernance();
        return true;
      } catch (err) {
        setGovernanceError(err instanceof Error ? err.message : 'Could not remove this draft change');
        return false;
      } finally {
        setIsChangeBusy(false);
      }
    },
    [reloadChangeGovernance]
  );

  const proposeDraftChanges = useCallback(
    async (summary?: string | null): Promise<boolean> => {
      if (!changeDraft) return false;
      if (draftOps.length === 0) return false;
      setIsChangeBusy(true);
      try {
        if (legacyDisabled.current || currentPlannerGovernancePort())
          throw new Error('Legacy governance session ended; original work is retained.');
        await submitTripChangeRequest(changeDraft.id, summary);
        setLayer('published');
        await reloadChangeGovernance();
        return true;
      } catch (err) {
        setGovernanceError(err instanceof Error ? err.message : 'Could not propose these changes');
        return false;
      } finally {
        setIsChangeBusy(false);
      }
    },
    [changeDraft, draftOps.length, reloadChangeGovernance]
  );

  const withdrawRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      setIsChangeBusy(true);
      try {
        if (legacyDisabled.current || currentPlannerGovernancePort())
          throw new Error('Legacy governance session ended; original work is retained.');
        await withdrawTripChangeRequest(requestId);
        await reloadChangeGovernance();
        return true;
      } catch (err) {
        setGovernanceError(err instanceof Error ? err.message : 'Could not withdraw this request');
        return false;
      } finally {
        setIsChangeBusy(false);
      }
    },
    [reloadChangeGovernance]
  );

  const resolveOp = useCallback(
    async (
      opId: string,
      accept: boolean,
      note?: string | null
    ): Promise<{ ok: boolean; errorCode?: string | null }> => {
      setIsChangeBusy(true);
      try {
        if (legacyDisabled.current || currentPlannerGovernancePort())
          throw new Error('Legacy governance session ended; original work is retained.');
        const result = await resolveTripChangeOp({ opId, accept, note });
        await reloadChangeGovernance();
        if (result.status === 'applied') await onAfterPublish?.();
        return { ok: !result.errorCode, errorCode: result.errorCode };
      } catch (err) {
        setGovernanceError(err instanceof Error ? err.message : 'Could not resolve this change');
        return { ok: false };
      } finally {
        setIsChangeBusy(false);
      }
    },
    [onAfterPublish, reloadChangeGovernance]
  );

  const resolveRequest = useCallback(
    async (requestId: string, acceptAll: boolean): Promise<{ ok: boolean; errorCodes: string[] }> => {
      setIsChangeBusy(true);
      try {
        if (legacyDisabled.current || currentPlannerGovernancePort())
          throw new Error('Legacy governance session ended; original work is retained.');
        const result = await resolveTripChangeRequest({ requestId, acceptAll });
        const errorCodes = failedResolveCodes(result.results);
        await reloadChangeGovernance();
        await onAfterPublish?.();
        return { ok: errorCodes.length === 0, errorCodes };
      } catch (err) {
        setGovernanceError(err instanceof Error ? err.message : 'Could not resolve this request');
        return { ok: false, errorCodes: [] };
      } finally {
        setIsChangeBusy(false);
      }
    },
    [onAfterPublish, reloadChangeGovernance]
  );

  const loadRequestOps = useCallback(async (requestId: string) => {
    return fetchTripChangeRequestOps(requestId);
  }, []);

  return {
    layer,
    setLayer,
    canMutate,
    canDraft,
    canEditPublished,
    canStageDraft: canStage,
    writeMode,
    writeModeFor,
    actionOutcomes,
    canUseEditors,
    changeDraft,
    draftOps,
    openChangeRequests,
    mySubmittedRequests,
    isChangeBusy,
    governanceError,
    mutateGateError,
    reloadChangeGovernance,
    addDraftOp,
    deleteDraftOp,
    proposeDraftChanges,
    withdrawRequest,
    resolveOp,
    resolveRequest,
    loadRequestOps,
    nextSortOrder,
  };
}

export function useFamilyTripWorkspaceGovernance(
  opts: Parameters<typeof useLegacyGovernance>[0]
): UseFamilyTripWorkspaceGovernanceResult {
  const { port, owned } = usePlannerGovernanceBinding();
  const legacy = useLegacyGovernance({ ...opts, cohortOwned: owned, enabled: opts.enabled && !owned });
  const planner = usePlannerGovernance({ ...opts, enabled: opts.enabled && port !== null }, port);
  return owned ? planner : legacy;
}
