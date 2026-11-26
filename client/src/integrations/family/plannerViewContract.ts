import { z } from 'zod';
import { locationId } from './planLocationContract';
import { plannerStateSchema } from './plannerStateContract';
import { validatePlannerState } from './plannerStateValidation';
import { FamilyApiError } from './repository';

export const plannerLayer = z.enum(['published', 'myDraft']);
export const plannerScope = z
  .object({
    user_id: locationId,
    family_id: locationId,
    person_id: locationId,
    trip_id: locationId,
    layer: plannerLayer,
  })
  .strict();
const binding = z
  .object({
    op_id: locationId,
    domain: z.enum(['location', 'visit']),
    action: z.string(),
    location_id: locationId.nullable(),
    visit_id: locationId.nullable(),
    virtual_location: z.boolean(),
    virtual_visit: z.boolean(),
  })
  .strict();
export const plannerViewSchema = z
  .object({
    version: z.literal(1),
    scope: plannerScope,
    state: plannerStateSchema,
    operations: z
      .array(
        z
          .object({
            op_id: locationId,
            status: z.enum(['projected', 'blocked']),
            payload: z.record(z.string(), z.unknown()),
            target_id: locationId.nullable(),
          })
          .strict()
      )
      .max(250),
    bindings: z.array(binding).max(250),
    draft_token: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    readiness: z
      .object({
        ready: z.boolean(),
        blockers: z
          .array(z.object({ op_id: locationId.nullable(), code: z.string(), visit_id: locationId.optional() }).strict())
          .max(10250),
      })
      .strict(),
  })
  .strict();
export type PlannerView = z.infer<typeof plannerViewSchema>;
export type PlannerScope = z.infer<typeof plannerScope>;
export type PlannerLayer = PlannerScope['layer'];
export function checkedPlannerView(raw: unknown, scope: PlannerScope): PlannerView {
  const parsed = plannerViewSchema.safeParse(raw);
  const invalid = () =>
    new FamilyApiError(502, 'invalid_planner_view', 'The planner view is inconsistent or belongs to another scope.');
  if (!parsed.success) throw invalid();
  const v = parsed.data;
  if (
    Object.keys(scope).some((k) => scope[k as keyof PlannerScope] !== v.scope[k as keyof PlannerScope]) ||
    v.state.trip_id !== scope.trip_id ||
    v.state.family_id !== scope.family_id
  )
    throw invalid();
  validatePlannerState(v.state);
  checkPlannerMetadata(v);
  const ops = new Map(v.operations.map((o) => [o.op_id, o]));
  for (const b of v.bindings) checkBinding(v, b, ops.get(b.op_id));
  for (const issue of v.readiness.blockers) if (issue.op_id && !ops.has(issue.op_id)) throw invalid();
  return v;
}

function checkPlannerMetadata(v: PlannerView): void {
  const invalid = () => new FamilyApiError(502, 'invalid_planner_metadata', 'Inconsistent planner operation metadata.');
  const ops = new Map(v.operations.map((o) => [o.op_id, o]));
  if (
    ops.size !== v.operations.length ||
    new Set(v.bindings.map((b) => b.op_id)).size !== v.bindings.length ||
    v.readiness.ready !== (v.readiness.blockers.length === 0)
  )
    throw invalid();
  if (
    v.scope.layer === 'published'
      ? v.operations.length || v.bindings.length || v.draft_token !== null || !v.readiness.ready
      : v.draft_token === null
  )
    throw invalid();
  if (!v.readiness.ready && v.bindings.length) throw invalid();
  if (
    v.readiness.ready &&
    (v.bindings.length !== v.operations.length || v.operations.some((o) => o.status !== 'projected'))
  )
    throw invalid();
}

function checkBinding(
  v: PlannerView,
  b: PlannerView['bindings'][number],
  o: PlannerView['operations'][number] | undefined
): void {
  const invalid = () => new FamilyApiError(502, 'invalid_planner_binding', 'Inconsistent planner identity binding.');
  if (
    !o ||
    o.status !== 'projected' ||
    o.payload.domain !== b.domain ||
    o.payload.action !== b.action ||
    (b.virtual_location && b.location_id !== b.op_id) ||
    (b.virtual_visit && b.visit_id !== b.op_id)
  )
    throw invalid();
  if (b.location_id && b.action !== 'trash' && !v.state.locations.some((l) => l.id === b.location_id)) throw invalid();
  if (b.visit_id && b.action !== 'trash' && !v.state.visits.some((s) => s.id === b.visit_id)) throw invalid();
}
