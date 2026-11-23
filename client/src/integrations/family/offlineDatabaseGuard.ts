import { installOfflineDatabaseCreationGuard, installOfflineDatabaseVersionGuard } from '../../db/offlineDb';
import { nativeDatabaseUser } from '../../db/sourceDatabase';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { offlineTripQualificationEnabled } from './offlineTripQualification';
import { familyAuthStore } from './repository';

/** A missing original database cannot be replaced underneath a qualified cold read. */
export function installFamilyOfflineDatabaseGuard() {
  if (!offlineTripQualificationEnabled()) return () => {};
  const releaseVersion = installOfflineDatabaseVersionGuard((name) => nativeDatabaseUser(name) !== null);
  const releaseCreation = installOfflineDatabaseCreationGuard((name) => {
    if (nativeDatabaseUser(name) === null) return;
    const auth = familyAuthStore.getState();
    if (
      isEffectivelyOffline() ||
      auth.isLoading ||
      auth.authCheckFailed ||
      !auth.isAuthenticated ||
      auth.authGate !== 'ok'
    )
      throw new Error(
        'The original local Trip database is missing. Reconnect and validate access before recreating it.'
      );
  });
  return () => {
    releaseCreation();
    releaseVersion();
  };
}
