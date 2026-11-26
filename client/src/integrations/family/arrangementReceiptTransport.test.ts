// organize-imports-ignore
// sort-imports-ignore
import '../../../tests/helpers/familyPlannerCohort/state';
import { describe, expect, it, vi } from 'vitest';
import { assignmentSetup } from '../../../tests/helpers/familyPlannerCohort/planning';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, uuid } from '../../../tests/helpers/familyPlannerCohort/state';
import { readArrangementReceipt } from './arrangementReceiptTransport';
import type { ArrangementPacket, ArrangementPlan } from './plannerArrangementContract';
async function packet(action: ArrangementPlan['action'] = 'reorder', layer: 'published' | 'myDraft' = 'published') {
  const v = await assignmentSetup(layer);
  const p = (
    await cohortState.cohort.assignments.prepare({ action: 'reorder', trip: v.trip, day: v.day, order: [v.b, v.a] })
  ).packet;
  p.plan.action = action;
  if (['trash', 'restore', 'move'].includes(action)) p.plan.visit = structuredClone(p.plan.days[0].observed[0]);
  if (action === 'trash') p.plan.days[0].order = p.plan.days[0].order.filter((id) => id !== p.plan.visit?.id);
  if (action === 'clear') p.plan.days[0].order = [];
  if (action === 'restore') p.plan.days[0].observed = p.plan.days[0].observed.filter((v) => v.id !== p.plan.visit?.id);
  return p;
}
function proof(p: ArrangementPacket) {
  const originals = new Map(p.plan.days.flatMap((d) => d.observed.map((v) => [v.id, v.revision] as const)));
  if (p.plan.visit) originals.set(p.plan.visit.id, p.plan.visit.revision);
  const rows = [...originals].map(([id, revision]) => ({ id, revision: revision + 1 }));
  const anchor = p.plan.visit?.id ?? p.plan.days[0].observed[0]?.id ?? null;
  return {
    version: 1,
    trip_id: p.scope.trip_id,
    operation_id: p.operation_id,
    scope: structuredClone(p.scope),
    plan: structuredClone(p.plan),
    request_sha256: 'a'.repeat(64),
    status: 'committed',
    result: {
      version: 1,
      state: 'published',
      changed: true,
      operation: null,
      result: {
        id: anchor,
        revision: rows.find((v) => v.id === anchor)?.revision ?? null,
        changed: true,
        rows,
        removed: rows
          .filter((v) => p.plan.action === 'clear' || (p.plan.action === 'trash' && v.id === p.plan.visit?.id))
          .map((v) => ({ ...v, day_id: p.plan.days[0].id })),
      },
    },
  };
}
describe('exact original arrangement outcome proof', () => {
  it.each(['move', 'reorder', 'trash', 'clear', 'restore'] as const)(
    '%s unknown and historical proof use only the exact read API',
    async (action) => {
      const p = await packet(action),
        r = proof(p),
        rpc = vi.fn().mockResolvedValue({ ...r, status: 'unknown', result: null });
      expect((await readArrangementReceipt(p, rpc)).status).toBe('unknown');
      expect(rpc).toHaveBeenCalledWith('get_family_native_arrangement_receipt_v1', {
        p_trip_id: p.scope.trip_id,
        p_operation_id: p.operation_id,
        p_scope: p.scope,
        p_plan: p.plan,
      });
      rpc.mockResolvedValue(r);
      expect((await readArrangementReceipt(p, rpc)).result).toEqual(r.result);
    }
  );
  it.each(['move', 'reorder', 'trash', 'clear', 'restore'] as const)(
    '%s accepts private historical or no-op outcomes without publishing them',
    async (action) => {
      const p = await packet(action, 'myDraft'),
        r = proof(p);
      const rpc = vi.fn().mockResolvedValue({
        ...r,
        result: {
          version: 1,
          state: 'submitted',
          changed: true,
          operation: { op_id: uuid(88), draft_id: uuid(89) },
          result: null,
        },
      });
      expect((await readArrangementReceipt(p, rpc)).status).toBe('committed');
      rpc.mockResolvedValue({
        ...r,
        result: { version: 1, state: 'draft', changed: false, operation: null, result: null },
      });
      expect((await readArrangementReceipt(p, rpc)).status).toBe('committed');
    }
  );
  it.each([
    'version',
    'trip',
    'operation',
    'scope',
    'plan',
    'digest',
    'unknown-result',
    'extra',
    'missing',
    'oversize',
    'state',
    'anchor',
    'revision',
    'duplicates',
    'extra-row',
    'missing-row',
    'old-revision',
    'removed',
    'changed',
    'nested-extra',
  ])('rejects %s without treating it as acknowledgement', async (mutation) => {
    const p = await packet(),
      r = proof(p);
    const record = r as unknown as Record<string, unknown>;
    if (mutation === 'version') record.version = 2;
    else if (mutation === 'trip') record.trip_id = uuid(99);
    else if (mutation === 'operation') record.operation_id = uuid(99);
    else if (mutation === 'scope') record.scope = { ...p.scope, person_id: uuid(99) };
    else if (mutation === 'plan') record.plan = { ...p.plan, action: 'clear' };
    else if (mutation === 'digest') record.request_sha256 = 'X'.repeat(64);
    else if (mutation === 'unknown-result') record.status = 'unknown';
    else if (mutation === 'extra') record.extra = true;
    else if (mutation === 'missing') delete record.result;
    else if (mutation === 'oversize') record.scope = { notes: 'x'.repeat(2097153) };
    else if (mutation === 'state') r.result.state = 'draft';
    else if (mutation === 'anchor') r.result.result.id = uuid(99);
    else if (mutation === 'revision') r.result.result.revision = 99;
    else if (mutation === 'duplicates') r.result.result.rows[1] = r.result.result.rows[0];
    else if (mutation === 'extra-row') r.result.result.rows.push({ id: uuid(99), revision: 1 });
    else if (mutation === 'missing-row') r.result.result.rows = [];
    else if (mutation === 'old-revision') r.result.result.rows[0].revision = 0;
    else if (mutation === 'removed')
      r.result.result.removed.push({ ...r.result.result.rows[0], day_id: p.plan.days[0].id });
    else if (mutation === 'changed') r.result.result.changed = false;
    else Object.assign(r.result.result.rows[0], { secret: true });
    await expect(readArrangementReceipt(p, vi.fn().mockResolvedValue(r))).rejects.toMatchObject({ status: 502 });
  });
  it.each(['42501', 'PT409', '40001', 'PGRST301', '55000', '54000', 'PGRST202'])(
    'refusal %s remains unavailable, never committed',
    async (code) => {
      const p = await packet();
      await expect(readArrangementReceipt(p, vi.fn().mockRejectedValue({ code }))).rejects.toMatchObject({
        status: code === '42501' ? 403 : ['PT409', '40001'].includes(code) ? 409 : code === 'PGRST301' ? 401 : 503,
      });
    }
  );
});
