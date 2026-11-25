import { z } from 'zod';
import { creationJson } from './creationIntentQueue';
import { checkCreationAcknowledgement } from './creationReceiptTransport';
import { FamilyApiError } from './errors';
import { locationId } from './planLocationContract';
import { creationForm, creationReceipt, creationScope, type CreationPacket } from './plannerCreationContract';

export const creationDigest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });
const fields = {
  version: z.literal(2),
  trip_id: locationId,
  operation_id: locationId,
  scope: creationScope,
  form: creationForm,
  request_sha256: creationDigest,
};
export const creationTerminalProof = z.discriminatedUnion('status', [
  z.object({ ...fields, status: z.literal('unknown'), cancelled_at: z.null(), result: z.null() }).strict(),
  z.object({ ...fields, status: z.literal('cancelled'), cancelled_at: timestamp, result: z.null() }).strict(),
  z
    .object({
      ...fields,
      status: z.literal('committed'),
      cancelled_at: z.null(),
      result: creationReceipt.passthrough(),
    })
    .strict(),
]);
export type CreationTerminalProof = z.infer<typeof creationTerminalProof>;
export function creationTerminalInvalid(): never {
  throw new FamilyApiError(
    502,
    'creation_terminal_invalid',
    'The service did not confirm this exact original. Nothing was removed.'
  );
}
/** Compare logical JSON echoes. This is deliberately NOT a JavaScript implementation of PostgreSQL hashing. */
export function checkCreationTerminalProof(
  raw: unknown,
  p: CreationPacket,
  expectedDigest?: string
): CreationTerminalProof {
  const bytes = JSON.stringify(raw);
  if (bytes === undefined || new TextEncoder().encode(bytes).length > 1048576) creationTerminalInvalid();
  const parsed = creationTerminalProof.safeParse(raw);
  if (!parsed.success) creationTerminalInvalid();
  const proof = parsed.data;
  if (
    proof.trip_id !== p.scope.trip_id ||
    proof.operation_id !== p.operation_id ||
    creationJson(proof.scope) !== creationJson(p.scope) ||
    creationJson(proof.form) !== creationJson(p.form) ||
    (expectedDigest !== undefined && proof.request_sha256 !== expectedDigest)
  )
    creationTerminalInvalid();
  if (proof.status === 'committed') checkCreationAcknowledgement(proof.result, p);
  return proof;
}
