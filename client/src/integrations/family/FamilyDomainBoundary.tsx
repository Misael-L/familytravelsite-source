import type { PropsWithChildren } from 'react';
import { useParams } from 'react-router';
import { FamilyJourneyRecovery } from './FamilyJourneyRecovery';
import { FamilyJourneyTrash } from './FamilyJourneyTrash';
import { FamilyTripParamsBoundary } from './navigation';
import { familyFrontend } from './repository';
import { isFamilyFrontendActive } from './runtime';
export function FamilyDomainBoundary({ kind, children }: PropsWithChildren<{ kind: 'journey' | 'collection' }>) {
  const { id } = useParams();
  return isFamilyFrontendActive() ? (
    <FamilyTripParamsBoundary repository={familyFrontend} kind={kind}>
      {children}
      {kind === 'journey' && (id ? <FamilyJourneyRecovery /> : <FamilyJourneyTrash />)}
    </FamilyTripParamsBoundary>
  ) : (
    <>{children}</>
  );
}
