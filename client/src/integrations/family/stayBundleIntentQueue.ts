import { createOriginalStayIntentQueue } from './originalStayIntentQueue';
import { originalStayBundle, type StayBundleEnvelope } from './stayBundleContract';

export const stayBundleIntentUrl = (p: StayBundleEnvelope) =>
  `/trips/${p.command.scope.trip_id}/family/stay-bundles/${p.command.stay_id}/commands`;
const queue = createOriginalStayIntentQueue(originalStayBundle, stayBundleIntentUrl);
export const matchesStayBundleIntent = queue.matches;
export const inspectStayBundleIntent = queue.inspect;
export const retainStayBundleIntent = queue.retain;
export const acknowledgeStayBundleIntent = queue.acknowledge;
export const parkStayBundleRefusal = queue.park;
