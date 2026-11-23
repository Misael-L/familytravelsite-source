import type { QueuedMutation } from '../../db/offlineDb';
import {
  createOriginalStayIntentQueue,
  originalStayIntentKeys,
  type OriginalStayOwner,
} from './originalStayIntentQueue';
import { stayEnvelope, type StayEnvelope } from './stayContract';

export type StayWriteSession = OriginalStayOwner;
export const stayIntentUrl = (p: StayEnvelope) =>
  `/trips/${p.command.scope.trip_id}/family/stays/${p.command.stay_id}/commands`;
export const stayIntentKeys = originalStayIntentKeys;
const queue = createOriginalStayIntentQueue((raw) => structuredClone(stayEnvelope.parse(raw)), stayIntentUrl);
export const matchesStayIntent = queue.matches;
export const inspectStayIntent = queue.inspect;
export const retainStayIntent = queue.retain;
export const acknowledgeStayIntent = queue.acknowledge;
export async function parkStayRefusal(
  owner: StayWriteSession,
  original: StayEnvelope,
  native: number,
  error: unknown,
  expected?: QueuedMutation
) {
  await queue.park(owner, original, native, error, expected);
}
