import { captureFamilyActor } from './actorContext';
import { FamilyApiError } from './errors';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import type { CreateTripProposalResult, CreateTripProposalRpcArgs } from './legacy/data/supabase/tripProposals';
import { useAuthStore } from './legacy/store/authStore';

const rejectionCodes = new Set(['22023', '22P02', '23503', '42501', 'P0001']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TripProposalRejected extends Error {}

export function prepareTripProposal(args: CreateTripProposalRpcArgs, personId: string) {
  const actor = captureFamilyActor();
  const session = useAuthStore.getState();
  if (!session.isAuthenticated || session.familyId !== args.p_family_id || session.personId !== personId) {
    throw new FamilyApiError(409, 'stale_family_actor', 'The Family account changed. Reopen New Trip to continue.');
  }
  return { actor, operationId: globalThis.crypto.randomUUID(), args };
}

export async function createTripProposalWithReceipt(
  operationId: string,
  args: CreateTripProposalRpcArgs
): Promise<CreateTripProposalResult> {
  const { data, error } = await getSupabaseBrowserClient().rpc('create_family_trip_proposal_v1', {
    ...args,
    p_operation_id: operationId,
  });
  if (error) {
    if (rejectionCodes.has(error.code)) throw new TripProposalRejected(error.message);
    throw error;
  }
  const row = data as Record<string, unknown> | null;
  const { proposal_id: proposalId, trip_id: tripId } = row ?? {};
  if (typeof proposalId !== 'string' || typeof tripId !== 'string' || !uuid.test(proposalId) || !uuid.test(tripId)) {
    throw new Error('Trip proposal RPC returned an incomplete receipt');
  }
  return { proposalId, tripId };
}
