import { FamilyApiError } from './errors';

const refusalByCode = new Map<string, { status: number; reason: string }>([
  ['42501', { status: 403, reason: 'access_denied' }],
  ['PGRST301', { status: 401, reason: 'session_required' }],
  ['PGRST302', { status: 401, reason: 'session_required' }],
  ['PGRST303', { status: 401, reason: 'session_required' }],
  ['PT409', { status: 409, reason: 'conflict' }],
  ['40001', { status: 409, reason: 'conflict' }],
  ['22023', { status: 400, reason: 'request_invalid' }],
  ['23503', { status: 422, reason: 'relationship_changed' }],
  ['23514', { status: 422, reason: 'relationship_changed' }],
  ['54000', { status: 413, reason: 'service_bound' }],
  ['0A000', { status: 422, reason: 'unsupported' }],
]);

function findPackingRpcRefusal(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return refusalByCode.get(code);
}

export function throwPackingRpcRefusal(error: unknown, refusalCode: string, message: string): never {
  const refusal = findPackingRpcRefusal(error);
  if (refusal) throw new FamilyApiError(refusal.status, refusalCode, message);
  throw error;
}

export function throwPackingCategoryOrGroupRefusal(
  error: unknown,
  domain: 'category' | 'group',
  message: string
): never {
  const refusal = findPackingRpcRefusal(error);
  if (!refusal || (domain === 'group' && refusal.reason === 'unsupported')) throw error;
  throw new FamilyApiError(refusal.status, `packing_${domain}_${refusal.reason}`, message);
}
