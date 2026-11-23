import { originalNativeStayIntent, type NativeStayEnvelope } from './nativeStayContract';
import { createOriginalStayIntentQueue } from './originalStayIntentQueue';
export const nativeStayIntentUrl = (p: NativeStayEnvelope) =>
  `/trips/${p.command.scope.trip_id}/family/native-stays/${p.command.stay_id}/commands`;
const queue = createOriginalStayIntentQueue(originalNativeStayIntent, nativeStayIntentUrl);
export const matchesNativeStayIntent = queue.matches;
export const inspectNativeStayIntent = queue.inspect;
export const retainNativeStayIntent = queue.retain;
export const acknowledgeNativeStayIntent = queue.acknowledge;
export const parkNativeStayRefusal = queue.park;
