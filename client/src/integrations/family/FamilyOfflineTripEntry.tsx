import { Suspense, useContext, useEffect, useMemo, useState, type PropsWithChildren, type ReactNode } from 'react';
import { UNSAFE_NavigationContext, UNSAFE_RouteContext, useLocation, type To } from 'react-router';
import ErrorBoundary from '../../components/shared/ErrorBoundary';
import ReadOnlyTripNotice from '../../components/shared/ReadOnlyTripNotice';
import TripLoadingSplash from '../../components/shared/TripLoadingSplash';
import MobileShell from '../../mobile/MobileShell';
import { useIsPhone } from '../../mobile/useIsPhone';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { canonicalFamilyDestination } from './navigation';
import { offlineTripQualificationEnabled } from './offlineTripQualification';
import { createOfflineTripSession, type OfflineTripSession } from './offlineTripSession';
const DesktopTrip = lazyWithRetry(() => import('../../pages/TripPlannerPage'));
const PhoneTrip = lazyWithRetry(() => import('../../mobile/screens/trip/MTripShell'));
/** This host is reachable only in the explicit loopback qualification build, never ordinary or hosted builds. */
export function FamilyOfflineTripEntry({ fallback }: { fallback: ReactNode }) {
  const { pathname } = useLocation(),
    trip = pathname.match(/^\/trips\/([0-9a-f-]{36})$/)?.[1];
  if (!offlineTripQualificationEnabled() || !trip) return <>{fallback}</>;
  return <OfflineOwner key={trip} trip={trip} fallback={fallback} />;
}
function OfflineOwner({ trip, fallback }: { trip: string; fallback: ReactNode }) {
  const [session, setSession] = useState<OfflineTripSession | null>(null),
    [refused, setRefused] = useState(false);
  useEffect(() => {
    let live = true,
      lease: OfflineTripSession | null = null;
    void createOfflineTripSession(trip, () => {
      if (live) {
        setRefused(true);
        setSession(null);
      }
    })
      .then((value) => {
        if (!live) value.dispose();
        else {
          lease = value;
          setSession(value);
        }
      })
      .catch(() => {
        if (live) setRefused(true);
      });
    return () => {
      live = false;
      lease?.dispose();
    };
  }, [trip]);
  if (refused) return <>{fallback}</>;
  if (!session) return <TripLoadingSplash />;
  return (
    <OfflineRoute session={session}>
      <NativeSavedTrip />
    </OfflineRoute>
  );
}
function NativeSavedTrip() {
  const phone = useIsPhone();
  return (
    <MobileShell isPhone={phone}>
      <ErrorBoundary boundaryId="saved-trip-qualification" level="route" variant={phone ? 'mobile' : 'desktop'}>
        <ReadOnlyTripNotice />
        <Suspense fallback={<TripLoadingSplash />}>{phone ? <PhoneTrip /> : <DesktopTrip />}</Suspense>
      </ErrorBoundary>
    </MobileShell>
  );
}
function OfflineRoute({ session, children }: PropsWithChildren<{ session: OfflineTripSession }>) {
  const nav = useContext(UNSAFE_NavigationContext),
    route = useContext(UNSAFE_RouteContext);
  const navigator = useMemo(() => {
    const base = nav.navigator,
      canonical = (to: To) => canonicalFamilyDestination(to, session.ids);
    return {
      ...base,
      createHref: (to: To) => base.createHref(canonical(to)),
      push: (...args: Parameters<typeof base.push>) => base.push(canonical(args[0]), args[1], args[2]),
      replace: (...args: Parameters<typeof base.replace>) => base.replace(canonical(args[0]), args[1], args[2]),
    };
  }, [nav.navigator, session]);
  const matches = route.matches.map((m) => ({
    ...m,
    params: { ...m.params, id: String(session.ids.register('trip', session.trip)) },
  }));
  return (
    <UNSAFE_NavigationContext.Provider value={{ ...nav, navigator }}>
      <UNSAFE_RouteContext.Provider value={{ ...route, matches }}>{children}</UNSAFE_RouteContext.Provider>
    </UNSAFE_NavigationContext.Provider>
  );
}
