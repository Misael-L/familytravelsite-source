import { admitCompletePreparation } from './completePreparationAdmission';
import { attachPreparationComponent } from './preparationComponentRead';
import { createPreparationReadiness, PreparationReadinessError } from './preparationReadiness';
import { familyFrontend, type FamilyFrontendRepository } from './repository';

/** Original online SDK/RLS/generation admission; inspection never captures bytes or grants offline authority. */
export async function openPreparationReadiness(
  value: number | string,
  repo: FamilyFrontendRepository = familyFrontend
) {
  const failure = () => new PreparationReadinessError('scope');
  return attachPreparationComponent(
    await admitCompletePreparation(value, repo, failure),
    createPreparationReadiness,
    failure
  );
}
