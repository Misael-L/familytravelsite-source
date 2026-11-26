import { z } from 'zod';
import { FamilyApiError } from './errors';
import { packingBagEnvelope } from './packingBagContract';
import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import { packingEnvelope, packingJson } from './packingCommandContract';
import { packingId, packingScope, packingTimestamp } from './packingContract';
export const packingRestoreEnvelope = z
  .union([packingBagEnvelope, packingCategoryAggregateEnvelope, packingEnvelope])
  .refine(
    (p) =>
      p.view_layer === 'published' && ['restore', 'bag-restore', 'category-restore-batch'].includes(p.command.action)
  );
export type PackingRestoreEnvelope = z.infer<typeof packingRestoreEnvelope>;
export const terminalProtocol = z.enum(['packing-item-v1', 'packing-category-aggregate-v3', 'packing-bag-v1']);
export function createPackingTerminalProof<
  Kind extends string,
  Protocol extends z.ZodType<string>,
  Action extends z.ZodType<string>,
>(kind: Kind, protocol: Protocol, action: Action) {
  const fields = {
    version: z.literal(1),
    kind: z.literal(kind),
    trip_id: packingId,
    operation_id: packingId,
    protocol,
    action,
    target_id: packingId,
    scope: packingScope,
    request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  };
  return z.discriminatedUnion('status', [
    z
      .object({
        ...fields,
        status: z.literal('unknown'),
        cancelled_at: z.null(),
        result_redacted: z.literal(false),
        result: z.null(),
      })
      .strict(),
    z
      .object({
        ...fields,
        status: z.literal('cancelled'),
        cancelled_at: packingTimestamp,
        result_redacted: z.literal(false),
        result: z.null(),
      })
      .strict(),
    z
      .object({
        ...fields,
        status: z.literal('committed'),
        cancelled_at: z.null(),
        result_redacted: z.boolean(),
        result: z.unknown(),
      })
      .strict()
      .refine((p) => (p.result_redacted ? p.result === null : p.result !== null && p.result !== undefined)),
  ]);
}
export const packingTerminalProof = createPackingTerminalProof(
  'packing-restore-terminal',
  terminalProtocol,
  z.enum(['restore', 'bag-restore', 'category-restore-batch'])
);
export type PackingTerminalProof = z.infer<typeof packingTerminalProof>;
export function terminalInvalid(): never {
  throw new FamilyApiError(
    502,
    'invalid_packing_terminal_proof',
    'The terminal proof does not match the exact original restore. Nothing was removed.'
  );
}
/** PostgreSQL17 jsonb::text framing, independently checked by real RPC cases. This is NOT the retained-row hash.
 * Key ordering: postgres REL_17_STABLE/src/backend/utils/adt/jsonb_util.c lengthCompareJsonbPair.
 * The accepted restore schemas contain safe integer numbers only; unfamiliar JSON refuses. */
export function packingPgJson(value: unknown): string {
  const seen = new Set<object>(),
    enc = new TextEncoder();
  const compare = (a: string, b: string) => {
    const x = enc.encode(a),
      y = enc.encode(b);
    if (x.length !== y.length) return x.length - y.length;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  const encode = (v: unknown, depth = 0): string => {
    if (depth > 100) return terminalInvalid();
    if (v === null) return 'null';
    if (typeof v === 'string') {
      if (v.includes('\0') || /\p{Surrogate}/u.test(v)) terminalInvalid();
      return JSON.stringify(v);
    }
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v)) terminalInvalid();
      return String(v);
    }
    if (!v || typeof v !== 'object' || seen.has(v)) return terminalInvalid();
    seen.add(v);
    try {
      if (Array.isArray(v)) {
        if (Object.keys(v).length !== v.length) terminalInvalid();
        return '[' + v.map((x) => encode(x, depth + 1)).join(', ') + ']';
      }
      if (
        ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
        Reflect.ownKeys(v).some((k) => typeof k !== 'string')
      )
        terminalInvalid();
      return (
        '{' +
        Object.keys(v)
          .sort(compare)
          .map((k) => encode(k) + ': ' + encode((v as Record<string, unknown>)[k], depth + 1))
          .join(', ') +
        '}'
      );
    } finally {
      seen.delete(v);
    }
  };
  return encode(value);
}
export function packingRestoreRequest(original: unknown) {
  const packet = packingRestoreEnvelope.parse(original),
    c = packet.command;
  const protocol =
    c.action === 'restore'
      ? ('packing-item-v1' as const)
      : c.action === 'bag-restore'
        ? ('packing-bag-v1' as const)
        : ('packing-category-aggregate-v3' as const);
  const args: Record<string, unknown> = {
    p_trip_id: c.scope.trip_id,
    p_operation_id: c.operation_id,
    p_scope: c.scope,
    p_action: c.action,
    p_target_id: c.target_id,
    ...('expected_revision' in c ? { p_expected_revision: c.expected_revision } : {}),
    p_expected_collection_revision: c.expected_collection_revision,
    ...('observed' in c ? { p_observed: c.observed } : {}),
    p_values: c.values,
  };
  const bound = protocol === 'packing-item-v1' ? 131072 : protocol === 'packing-bag-v1' ? 1048576 : 8388608;
  if (new TextEncoder().encode(packingPgJson(args)).length > bound) terminalInvalid();
  const intent =
    protocol === 'packing-item-v1'
      ? [c.scope, c.action, c.target_id, args.p_expected_revision, null, c.values]
      : protocol === 'packing-bag-v1'
        ? [
            protocol,
            c.scope,
            c.action,
            c.target_id,
            args.p_expected_revision,
            c.expected_collection_revision,
            args.p_observed,
            c.values,
          ]
        : [protocol, c.scope, c.action, c.target_id, c.expected_collection_revision, args.p_observed, c.values];
  return { packet, protocol, args, intent };
}
export async function packingRestoreDigest(original: unknown) {
  const { intent } = packingRestoreRequest(original);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(packingPgJson(intent)))),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');
}
export const sameTerminalScope = (a: z.infer<typeof packingScope>, b: z.infer<typeof packingScope>) =>
  packingJson(a) === packingJson(b);
