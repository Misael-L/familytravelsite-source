// Compatibility path; the shared implementation lives below the sync layer.
export {
  notifyPrivateSessionEnd,
  onPrivateSessionEnd,
  privateSessionCleanupFailures,
} from '../db/privateSessionEvents';
