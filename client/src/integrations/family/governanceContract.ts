import { z } from 'zod';
import { locationId } from './planLocationContract';
import { plannerScope } from './plannerViewContract';
import { FamilyApiError } from './repository';
export const governanceScope = plannerScope.extend({ version: z.literal(1) }).strict();
export const governanceOperation = z
  .object({
    id: locationId,
    draft_id: locationId.optional(),
    request_id: locationId.optional(),
    module: z.enum(['plan_item', 'day_note', 'reservation', 'expense', 'trip_place']),
    op: z.enum(['add', 'update', 'remove']),
    payload: z.unknown(),
    sort_order: z.number().nullable(),
    status: z.string().optional(),
  })
  .passthrough();
export const governanceGroup = z
  .object({
    record: z
      .object({
        id: locationId,
        trip_id: locationId,
        owner_person_id: locationId.optional(),
        proposed_by_person_id: locationId.optional(),
        status: z.enum(['submitted', 'partially_applied', 'applied', 'rejected', 'withdrawn']).optional(),
      })
      .passthrough(),
    operations: z.array(governanceOperation).max(1000),
  })
  .strict();
export const governanceView = z
  .object({
    version: z.literal(1),
    scope: governanceScope,
    permissions: z
      .object({
        can_mutate: z.boolean(),
        can_draft: z.boolean(),
        outcomes: z.record(z.string(), z.enum(['direct', 'propose', 'deny'])),
      })
      .strict(),
    draft: governanceGroup.nullable(),
    requests: z.array(governanceGroup).max(100),
  })
  .strict();
export const governanceCommand = z
  .object({
    version: z.literal(1),
    operation_id: locationId,
    source_url: z.url(),
    scope: governanceScope,
    action: z.enum(['submit', 'review_op', 'review_request']),
    target_id: locationId,
    observation: governanceGroup,
    parameters: z.record(z.string(), z.unknown()),
  })
  .strict();
export const governanceReceipt = z
  .object({
    version: z.literal(1),
    trip_id: locationId,
    operation_id: locationId,
    action: z.enum(['submit', 'review_op', 'review_request']),
    target_id: locationId,
    result: z.record(z.string(), z.unknown()),
  })
  .strict();
export type GovernanceView = z.infer<typeof governanceView>;
export type GovernanceGroup = z.infer<typeof governanceGroup>;
export type GovernanceCommand = z.infer<typeof governanceCommand>;
export function checkedGovernance(raw: unknown, scope: z.infer<typeof governanceScope>) {
  const v = governanceView.parse(raw);
  if (Object.entries(scope).some(([k, x]) => v.scope[k as keyof typeof scope] !== x))
    throw new FamilyApiError(502, 'governance_scope', 'Another governance scope was returned.');
  for (const group of [v.draft, ...v.requests]) {
    if (!group) continue;
    if (
      group.record.trip_id !== scope.trip_id ||
      new Set(group.operations.map((o) => o.id)).size !== group.operations.length
    )
      throw new FamilyApiError(502, 'governance_identity', 'Inconsistent governance identities.');
    for (const op of group.operations)
      if ((group === v.draft ? op.draft_id : op.request_id) !== group.record.id)
        throw new FamilyApiError(502, 'governance_parent', 'Another operation parent was returned.');
  }
  if (v.draft && v.draft.record.owner_person_id !== scope.person_id)
    throw new FamilyApiError(502, 'governance_owner', 'Another private draft was returned.');
  return v;
}
