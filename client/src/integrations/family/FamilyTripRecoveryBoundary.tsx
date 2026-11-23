import { useCallback, type PropsWithChildren } from 'react';
import { useNavigate } from 'react-router';
import { FamilyAggregateTrash } from './FamilyAggregateTrash';
import { isFamilyFrontendActive } from './runtime';
export function FamilyTripRecoveryBoundary({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const reload = useCallback(async () => {
    await navigate(0);
  }, [navigate]);
  return (
    <>
      {children}
      {isFamilyFrontendActive() && <FamilyAggregateTrash domain="trips" onRestored={reload} />}
    </>
  );
}
