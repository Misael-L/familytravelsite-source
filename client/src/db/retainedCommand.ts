import { isFamilyFrontendActive } from '../integrations/family/runtime';
import type { QueuedMutation } from './offlineDb';
import { hasPackingDependency } from './packingDependencyProtection';
import { isSupportedMutationFormat } from './queueFormat';

let cohortGuards = 0;
/** Explicit cohorts and the installed Family runtime both protect legacy native Trip requests. */
export function installFamilyCommandRetention() {
  cohortGuards++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      cohortGuards--;
    }
  };
}
/** Imported sources are original Family work even after their last queue row is gone. */
export const protectsImportSources = () => cohortGuards > 0 || isFamilyFrontendActive();
/** A versioned Family command is an original intent, never a replaceable row image. */
export function isRetainedCommand(m: QueuedMutation): boolean {
  return (
    hasPackingDependency(m) ||
    /^\/family\/collections(?:\/|$)/.test(m.url) ||
    m.retentionPolicy === 'family-original-v1' ||
    /^\/trips\/[^/]+\/family(?:\/|$)/.test(m.url) ||
    ((cohortGuards > 0 || isFamilyFrontendActive()) && /^\/trips\/[^/]+(?:\/|$)/.test(m.url))
  );
}
/** Protection is not permission to replay an unknown protocol. */
export const isProtectedQueueWork = (m: QueuedMutation) => isRetainedCommand(m) || !isSupportedMutationFormat(m);
/** Raw native payloads do not carry the checked Family source/scope/observation contract. */
export const isUnscopedFamilyWrite = (m: QueuedMutation) =>
  isFamilyFrontendActive() && /^\/trips\/[^/]+(?:\/|$)/.test(m.url) && !/^\/trips\/[^/]+\/family(?:\/|$)/.test(m.url);
export class RetainedCommandError extends Error {
  constructor(
    message = 'The original Family command is retained. Retry sends that same command; automatic overwrite or discard is unavailable.'
  ) {
    super(message);
    this.name = 'RetainedCommandError';
  }
}
