import { useLayoutEffect, type PropsWithChildren } from 'react';
import { useParams } from 'react-router';
import { useFamilyController } from './controllerContext';
import { FamilyPlannerBoundary } from './FamilyPlannerBoundary';
import { FamilyReadAlerts } from './FamilyReadStatus';
import { TranslationProvider } from './legacy/i18n';
import FamilyFrontendController from './legacy/pages/FamilyFrontendController';
import { FamilyTripParamsBoundary } from './navigation';
import { usePlannerBoundaryBinding } from './plannerBoundaryOwner';
import { familyFrontend } from './repository';
import { isFamilyFrontendActive } from './runtime';

export function FamilyTripBoundary({ children }: PropsWithChildren) {
  const { id } = useParams();
  const binding = usePlannerBoundaryBinding();
  if (!isFamilyFrontendActive()) return <>{children}</>;
  if (binding.owned)
    return (
      <TranslationProvider>
        <FamilyPlannerBoundary key={id} owner={binding.owner}>
          {children}
          <FamilyReadAlerts />
        </FamilyPlannerBoundary>
      </TranslationProvider>
    );
  return (
    <TranslationProvider>
      <FamilyFrontendController key={id}>
        <FamilyTripParamsBoundary repository={familyFrontend}>
          {children}
          <FamilyReadAlerts />
        </FamilyTripParamsBoundary>
      </FamilyFrontendController>
    </TranslationProvider>
  );
}

export function useFamilyTripTabBridge(tab: string) {
  const controller = useFamilyController();
  useLayoutEffect(() => {
    if (!controller) return;
    const mapped = tab === 'dateien' ? 'files' : tab === 'listen' ? 'lists' : tab;
    if (
      mapped === 'plan' ||
      mapped === 'transports' ||
      mapped === 'buchungen' ||
      mapped === 'lists' ||
      mapped === 'finanzplan' ||
      mapped === 'files'
    )
      controller.setTab(mapped);
  }, [tab, controller?.setTab]);
}
