import { admitPublicImagePreparation } from './completePreparationAdmission';
import { attachPreparationComponent } from './preparationComponentRead';
import { createPublicImagePreparation, PublicImagePreparationError } from './publicImagePreparation';
import { familyFrontend, type FamilyFrontendRepository } from './repository';

export async function openPublicImagePreparation(
  value: number | string,
  repo: FamilyFrontendRepository = familyFrontend
) {
  const failure = () => new PublicImagePreparationError('scope');
  return attachPreparationComponent(
    await admitPublicImagePreparation(value, repo, failure),
    createPublicImagePreparation,
    failure
  );
}
