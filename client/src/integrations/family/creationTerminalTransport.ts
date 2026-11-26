import { checkCreationTerminalProof } from './creationTerminalContract';
import { FamilyApiError } from './errors';
import { locationRpc } from './planLocations';
import type { CreationPacket } from './plannerCreationContract';
import type { TaskRpc } from './taskTransport';
export function createCreationTerminalTransport(rpc: TaskRpc = locationRpc) {
  const call = async (name: string, p: CreationPacket, digest?: string) => {
    if (new TextEncoder().encode(JSON.stringify([p.scope, p.form])).length > 180000)
      throw new FamilyApiError(400, 'creation_terminal_bound', 'The original exceeds its bound. Nothing was removed.');
    let raw: unknown;
    try {
      raw = await rpc(name, {
        p_trip_id: p.scope.trip_id,
        p_operation_id: p.operation_id,
        p_scope: p.scope,
        p_form: p.form,
      });
    } catch (error) {
      if (error instanceof FamilyApiError) throw error;
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      throw new FamilyApiError(
        code === '42501'
          ? 403
          : code === 'PT409'
            ? 409
            : ['PGRST301', 'PGRST302', 'PGRST303'].includes(code)
              ? 401
              : 503,
        'creation_terminal_refused',
        'Could not confirm the original cancellation. Its decision and original remain retained.'
      );
    }
    return checkCreationTerminalProof(raw, p, digest);
  };
  return {
    read: (p: CreationPacket, digest?: string) => call('get_family_native_plan_receipt_v2', p, digest),
    cancel: (p: CreationPacket, digest: string) => call('cancel_family_native_plan_v1', p, digest),
  };
}
