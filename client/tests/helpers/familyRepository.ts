import type { FamilyIdentityRegistry } from '../../src/integrations/family/identity';
import { FamilyFrontendRepository } from '../../src/integrations/family/repository';

/** Use the actual context owner; only canonical data and legacy projections are fake. */
export function familyRepositoryFixture<T extends object>(
  familyId: string,
  identities: () => FamilyIdentityRegistry,
  projections: T
) {
  return Object.assign(
    new FamilyFrontendRepository(async () => ({
      userId: '10000000-0000-4000-8000-000000000090',
      personId: '10000000-0000-4000-8000-000000000091',
      familyId,
      user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: '2026-01-01' },
    })),
    { views: async () => ({ ids: identities() }), knownViews: () => ({ ids: identities() }) },
    projections
  );
}
