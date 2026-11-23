import { currentSourcePolicy } from '../../db/sourceDatabase';
import { downloadOriginalWork } from '../../sync/originalWorkExport';
import { downloadRetainedWork } from '../../sync/retainedRecovery';
import { offlineTripQualificationEnabled } from './offlineTripQualification';
import { isFamilyFrontendActive } from './runtime';
export const familyOriginalWorkExportEnabled = () =>
  isFamilyFrontendActive() && (offlineTripQualificationEnabled() || !!currentSourcePolicy());
/** Preserve ordinary v1 behavior until the binary archive passes local qualification. */
export function downloadFamilyOriginalWork() {
  return familyOriginalWorkExportEnabled() ? downloadOriginalWork() : downloadRetainedWork();
}
