// organize-imports-ignore
// sort-imports-ignore
import '../../../tests/helpers/familyPlannerCohort/state';
import { describe, it, expect, vi } from 'vitest';
import { load, request, form } from '../../../tests/helpers/familyPlannerCohort/core';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, uuid } from '../../../tests/helpers/familyPlannerCohort/state';
import { editorScope, type EditorPacket } from './plannerEditorContract';
import { readEditorReceipt } from './editorReceiptTransport';
async function packet(selected: boolean) {
  await load();
  const r = request(selected),
    e = await cohortState.cohort.openEditor(r);
  return (await cohortState.cohort.prepare(r, form(e))).body;
}
function proof(p: EditorPacket) {
  const o = editorScope(p);
  return {
    version: 1,
    kind: p.kind,
    trip_id: o.trip_id,
    target_id: p.target_id,
    operation_id: p.operation_id,
    observation: structuredClone(p.request.observation),
    form: structuredClone(p.request.form),
    request_sha256: 'a'.repeat(64),
    status: 'committed',
    result:
      p.kind === 'location'
        ? {
            version: 1,
            location_id: o.location_id,
            state: 'published',
            revision: o.revision,
            changed: false,
            draft_id: null,
            op_id: null,
          }
        : {
            version: 1,
            visit_id: p.target_id,
            location_id: o.location_id,
            state: 'published',
            visit_revision: p.request.observation.visit_revision,
            location_revision: o.revision,
            places_intent: false,
            changed: false,
            draft_id: null,
            op_id: null,
          },
  };
}
describe('original-bound editor outcome transport', () => {
  it.each([false, true])(
    'selected=%s calls only the typed reader with exact original and accepts unknown',
    async (selected) => {
      const p = await packet(selected),
        r = proof(p),
        rpc = vi.fn().mockResolvedValue({ ...r, status: 'unknown', result: null });
      expect((await readEditorReceipt(p, rpc)).status).toBe('unknown');
      expect(rpc).toHaveBeenCalledWith(`get_family_trip_${p.kind}_form_receipt_v1`, {
        p_trip_id: editorScope(p).trip_id,
        [selected ? 'p_visit_id' : 'p_location_id']: p.target_id,
        p_operation_id: p.operation_id,
        p_observation: p.request.observation,
        p_form: p.request.form,
      });
    }
  );
  for (const selected of [false, true])
    it.each([
      'kind',
      'trip',
      'target',
      'operation',
      'observation',
      'form',
      'digest',
      'result-target',
      'result-layer',
      'unknown-result',
      'extra',
      'missing',
      'oversize',
    ])('selected=' + selected + ' refuses %s without an acknowledgement', async (mutation) => {
      const p = await packet(selected),
        r: Record<string, unknown> = proof(p);
      const result = r.result as Record<string, unknown>;
      if (mutation === 'kind') r.kind = selected ? 'location' : 'visit';
      else if (mutation === 'trip') r.trip_id = uuid(90);
      else if (mutation === 'target') r.target_id = uuid(90);
      else if (mutation === 'operation') r.operation_id = uuid(90);
      else if (mutation === 'observation') r.observation = { ...p.request.observation, layer: 'myDraft' };
      else if (mutation === 'form') r.form = { ...p.request.form, notes: 'Changed original' };
      else if (mutation === 'digest') r.request_sha256 = 'X'.repeat(64);
      else if (mutation === 'result-target') result.location_id = uuid(90);
      else if (mutation === 'result-layer') result.state = 'draft';
      else if (mutation === 'unknown-result') r.status = 'unknown';
      else if (mutation === 'extra') r.extra = true;
      else if (mutation === 'missing') delete r.result;
      else r.form = { notes: 'x'.repeat(2097153) };
      await expect(readEditorReceipt(p, vi.fn().mockResolvedValue(r))).rejects.toMatchObject({ status: 502 });
    });
});
