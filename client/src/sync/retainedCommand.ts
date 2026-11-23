// Compatibility path; the shared implementation lives below the sync layer.
export {
  RetainedCommandError,
  installFamilyCommandRetention,
  isProtectedQueueWork,
  isRetainedCommand,
  isUnscopedFamilyWrite,
} from '../db/retainedCommand';
