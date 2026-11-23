import { z, ZodError } from 'zod';
import { checkedGovernance, governanceCommand, governanceReceipt, type GovernanceCommand } from './governanceContract';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { locationRpc } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
export async function handleFamilyGovernance(repo: FamilyFrontendRepository, r: FamilyRequest) {
  const m = r.pathname.match(/^\/trips\/([^/]+)\/family\/governance(?:\/(commands))?$/);
  if (!m) return NOT_HANDLED;
  try {
    const session = await repo.session(),
      ids = (await repo.views()).ids,
      trip = await repo.tripUuid(m[1]),
      source = getSupabaseUrl();
    const scope = {
      version: 1 as const,
      trip_id: trip,
      family_id: session.familyId,
      user_id: session.userId,
      person_id: session.personId,
      layer: repo.getLayer(trip),
    };
    const fence = async () => {
      const now = await repo.session();
      if (
        source !== getSupabaseUrl() ||
        ids !== (await repo.views()).ids ||
        now.userId !== scope.user_id ||
        now.familyId !== scope.family_id ||
        now.personId !== scope.person_id ||
        repo.getLayer(trip) !== scope.layer
      )
        throw new FamilyApiError(409, 'governance_session', 'The original governance session changed.');
    };
    await fence();
    const result = await dispatchGovernance(r, Boolean(m[2]), { scope, source, trip });
    await fence();
    if (m[2]) repo.invalidate(trip);
    return result;
  } catch (error) {
    if (error instanceof FamilyApiError) throw error;
    if (error instanceof ZodError) throw new FamilyApiError(400, 'governance_contract', 'Invalid governance contract.');
    const code = (error as { code?: string }).code ?? '',
      status =
        code === '42501'
          ? 403
          : ['PT409', '40001', '0A000', '54000'].includes(code)
            ? 409
            : code.startsWith('22')
              ? 400
              : code.startsWith('23')
                ? 422
                : 503;
    throw new FamilyApiError(status, 'governance_' + code, (error as Error).message ?? 'Governance unavailable.');
  }
}

type Context = { scope: GovernanceCommand['scope']; source: string; trip: string };
async function dispatchGovernance(r: FamilyRequest, command: boolean, c: Context) {
  if (!command && r.method === 'GET') {
    if (r.query.size)
      throw new FamilyApiError(400, 'governance_query', 'Governance reads use the current layer without filters.');
    return checkedGovernance(
      await locationRpc('get_family_plan_governance_v1', { p_trip_id: c.trip, p_layer: c.scope.layer }),
      c.scope
    );
  }
  if (!command || r.method !== 'POST')
    throw new FamilyApiError(405, 'governance_method', 'Unsupported governance method.');
  if (r.query.size || r.headers?.['x-base-updated-at'])
    throw new FamilyApiError(400, 'governance_shape', 'Use the complete original governance command.');
  if (new TextEncoder().encode(JSON.stringify(r.body)).length > 8388608)
    throw new FamilyApiError(400, 'governance_bound', 'Governance command exceeds its bound.');
  const p = governanceCommand.parse(r.body);
  if (p.source_url !== c.source || Object.entries(c.scope).some(([k, x]) => p.scope[k as keyof typeof c.scope] !== x))
    throw new FamilyApiError(409, 'governance_scope', 'The original command belongs to another scope.');
  if (r.headers?.['x-idempotency-key'] !== p.operation_id)
    throw new FamilyApiError(400, 'governance_retry', 'The original retry identity is required.');
  if (p.action === 'submit')
    z.object({ summary: z.string().max(20000).nullable().optional() })
      .strict()
      .parse(p.parameters);
  else
    z.object({ accept: z.boolean(), note: z.string().max(20000).nullable().optional() })
      .strict()
      .parse(p.parameters);
  const result = governanceReceipt.parse(
    await locationRpc('execute_family_plan_governance_v1', {
      p_trip_id: c.trip,
      p_operation_id: p.operation_id,
      p_scope: p.scope,
      p_action: p.action,
      p_target_id: p.target_id,
      p_observation: p.observation,
      p_parameters: p.parameters,
    })
  );
  if (
    result.trip_id !== c.trip ||
    result.operation_id !== p.operation_id ||
    result.action !== p.action ||
    result.target_id !== p.target_id
  )
    throw new FamilyApiError(502, 'governance_receipt', 'Another command acknowledgement was returned.');
  return result;
}
