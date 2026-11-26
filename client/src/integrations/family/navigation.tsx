import { useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { UNSAFE_NavigationContext, UNSAFE_RouteContext, useParams, type To } from 'react-router';
import TripLoadingSplash from '../../components/shared/TripLoadingSplash';
import { captureFamilyActor, onFamilyActorChange } from './actorContext';
import type { FamilyIdentityRegistry } from './identity';
import type { FamilyFrontendRepository } from './repository';
import { FamilyApiError, familyAuthStore } from './repository';

export function canonicalFamilyDestination(to: To, ids: FamilyIdentityRegistry | null): To {
  if (!ids) return to;
  if (typeof to === 'string') return ids.canonicalTripPath(to);
  return to.pathname ? { ...to, pathname: ids.canonicalTripPath(to.pathname) } : to;
}

/** Reuse the app's one router. Browser URLs remain canonical Family UUIDs. */
export function FamilyNavigationBoundary({
  repository,
  children,
}: PropsWithChildren<{ repository: FamilyFrontendRepository }>) {
  const context = useContext(UNSAFE_NavigationContext);
  const navigator = useMemo(() => {
    const base = context.navigator;
    const canonical = (to: To) => canonicalFamilyDestination(to, repository.knownViews()?.ids ?? null);
    return {
      ...base,
      createHref: (to: To) => base.createHref(canonical(to)),
      push: (...args: Parameters<typeof base.push>) => base.push(canonical(args[0]), args[1], args[2]),
      replace: (...args: Parameters<typeof base.replace>) => base.replace(canonical(args[0]), args[1], args[2]),
    };
  }, [context.navigator, repository]);
  return (
    <UNSAFE_NavigationContext.Provider value={{ ...context, navigator }}>{children}</UNSAFE_NavigationContext.Provider>
  );
}

/** Only the copied controller sees a view key; the route and Family adapters keep UUIDs. */
export function FamilyTripParamsBoundary({
  repository,
  children,
  kind = 'trip',
}: PropsWithChildren<{ repository: FamilyFrontendRepository; kind?: 'trip' | 'journey' | 'collection' }>) {
  const route = useContext(UNSAFE_RouteContext);
  const { id } = useParams();
  type Owner = ReturnType<typeof captureFamilyActor>;
  const [resolved, setResolved] = useState<{ input: string; key: string; owner: Owner } | null>(null);
  const [error, setError] = useState<{ value: Error; owner: Owner } | null>(null);
  useEffect(() => {
    let active = true,
      request = 0;
    const resolve = () => {
      const token = ++request,
        owner = captureFamilyActor();
      setError(null);
      setResolved(null);
      // The repository owns access validation; this adapter only resolves IDs.
      if (!id) return;
      void repository
        .views()
        .then((v) => {
          if (!active || token !== request || !owner.current()) return;
          const uuid = v.ids.uuid(kind, id);
          const key = String(v.ids.register(kind, uuid));
          setResolved({ input: id, key, owner });
        })
        .catch((e) => {
          if (!active || token !== request || !owner.current()) return;
          // Current sign-out belongs to the outer native gate, never the generic
          // route error UI. Other current repository failures remain visible.
          if (
            e instanceof FamilyApiError &&
            e.code === 'session_required' &&
            !familyAuthStore.getState().isAuthenticated
          )
            return;
          setError({ value: e instanceof Error ? e : new Error('Trip unavailable'), owner });
        });
    };
    const stop = onFamilyActorChange(() => {
      const auth = familyAuthStore.getState();
      if (auth.isAuthenticated && auth.authGate === 'ok') resolve();
      else {
        ++request;
        setError(null);
        setResolved(null);
      }
    });
    resolve();
    return () => {
      active = false;
      stop();
    };
  }, [id, repository, kind]);
  if (error?.owner.current()) throw error.value;
  if (!id) return <>{children}</>;
  if (resolved?.input !== id || !resolved.owner.current()) return <TripLoadingSplash />;
  const matches = route.matches.map((m) => ({ ...m, params: { ...m.params, id: resolved.key } }));
  return <UNSAFE_RouteContext.Provider value={{ ...route, matches }}>{children}</UNSAFE_RouteContext.Provider>;
}
