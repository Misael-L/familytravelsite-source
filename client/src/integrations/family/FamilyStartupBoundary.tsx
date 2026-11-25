import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { useLocation } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { useNetworkMode } from '../../hooks/useNetworkMode';
import { useAuthStore } from '../../store/authStore';
import { isEffectivelyOffline, onNetworkModeChange } from '../../sync/networkMode';
import { captureFamilyActor } from './actorContext';
import { FamilyOfflineTripEntry } from './FamilyOfflineTripEntry';
import { PageLoadFailed } from './legacy/components/shared/PageLoadFailed';
import { TranslationProvider, useTranslation } from './legacy/i18n';
import { familyAuthStore } from './repository';
import { isFamilyFrontendActive } from './runtime';

/** Display snapshots identify retained work; they never open a private controller. */
export function FamilyStartupBoundary({ children }: PropsWithChildren) {
  const family = familyAuthStore(
      useShallow((s) => ({
        isAuthenticated: s.isAuthenticated,
        isLoading: s.isLoading,
        authCheckFailed: s.authCheckFailed,
        authGate: s.authGate,
        authUserId: s.authUserId,
        personId: s.personId,
        familyId: s.familyId,
      }))
    ),
    native = useAuthStore(
      useShallow((s) => ({
        isAuthenticated: s.isAuthenticated,
        isLoading: s.isLoading,
        authCheckFailed: s.authCheckFailed,
        user: s.user,
      }))
    ),
    location = useLocation();
  if (!isFamilyFrontendActive()) return <>{children}</>;
  const scope = JSON.stringify([
    String(import.meta.env.VITE_SUPABASE_URL ?? '')
      .trim()
      .replace(/\/+$/, ''),
    family.authUserId,
    family.personId,
    family.familyId,
    family.authGate,
    native.user?.id,
    location.pathname,
  ]);
  return (
    <StartupOwner key={scope} family={family} native={native}>
      {children}
    </StartupOwner>
  );
}
function StartupOwner({
  family,
  native,
  children,
}: PropsWithChildren<{
  family: FamilyStartupState;
  native: NativeStartupState;
}>) {
  const { offline } = useNetworkMode();
  const [owner] = useState(() => captureFamilyActor());
  const [admission] = useState(() => new StartupAdmission(owner));
  const admitted = useSyncExternalStore(admission.subscribe, admission.get, admission.get);
  const [busy, setBusy] = useState(false);
  const flight = useRef(false),
    live = useRef(false),
    wasOffline = useRef(offline),
    reconnect = useRef(false);
  const knownRefusal = family.authGate !== null && family.authGate !== 'ok';
  const ready = readyAccess(family, native);
  const recovering =
    !knownRefusal &&
    !admitted &&
    (family.isAuthenticated || native.isAuthenticated || (family.authCheckFailed && native.authCheckFailed)) &&
    (busy || (!family.isLoading && !native.isLoading && (!ready || offline)));
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const retry = useCallback(async () => {
    if (!live.current || flight.current || !owner.current() || isEffectivelyOffline()) return;
    flight.current = true;
    setBusy(true);
    try {
      await useAuthStore.getState().loadUser();
    } catch {
      /* The native/Family auth stores own the current refusal; never synthesize a session. */
    } finally {
      flight.current = false;
      if (live.current) setBusy(false);
    }
  }, [owner]);
  useEffect(() => {
    if (wasOffline.current && !offline) reconnect.current = true;
    wasOffline.current = offline;
    if (!offline && recovering && !flight.current && reconnect.current) {
      reconnect.current = false;
      void retry();
    }
  }, [offline, recovering, retry]);
  // Warm screens keep their typed work. Current MFA/membership refusals still
  // flow to ProtectedRoute, and every actual command rechecks its original scope.
  if (!recovering) return <>{children}</>;
  return (
    <TranslationProvider>
      <FamilyOfflineTripEntry fallback={<Recovery offline={offline} busy={busy} retry={retry} />} />
    </TranslationProvider>
  );
}
function Recovery({ offline, busy, retry }: { offline: boolean; busy: boolean; retry: () => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <PageLoadFailed
      title={offline ? t('common.startupOfflineTitle') : t('common.startupFailedTitle')}
      body={offline ? t('common.startupOfflineBody') : t('common.startupFailedBody')}
      onRetry={
        offline
          ? undefined
          : () => {
              void retry();
            }
      }
      retryLabel={busy ? t('common.loading') : t('common.errorRetry')}
    />
  );
}

type FamilyStartupState = Pick<
  ReturnType<typeof familyAuthStore.getState>,
  'isAuthenticated' | 'isLoading' | 'authCheckFailed' | 'authGate' | 'authUserId' | 'personId' | 'familyId'
>;
type NativeStartupState = Pick<
  ReturnType<typeof useAuthStore.getState>,
  'isAuthenticated' | 'isLoading' | 'authCheckFailed' | 'user'
>;
function readyAccess(family: FamilyStartupState, native: NativeStartupState) {
  return (
    family.isAuthenticated &&
    family.authGate === 'ok' &&
    !family.authCheckFailed &&
    native.isAuthenticated &&
    !native.authCheckFailed &&
    !family.isLoading &&
    !native.isLoading
  );
}
/** A warm route's admission belongs to its captured actor, never a later account.
 * Update from external store/network events so an outage cannot tear down typed work. */
class StartupAdmission {
  private admitted: boolean;
  constructor(private owner: ReturnType<typeof captureFamilyActor>) {
    this.admitted =
      owner.current() && !isEffectivelyOffline() && readyAccess(familyAuthStore.getState(), useAuthStore.getState());
  }
  get = () => this.admitted;
  subscribe = (listener: () => void) => {
    const update = () => {
      if (
        !this.admitted &&
        this.owner.current() &&
        !isEffectivelyOffline() &&
        readyAccess(familyAuthStore.getState(), useAuthStore.getState())
      ) {
        this.admitted = true;
        listener();
      }
    };
    const family = familyAuthStore.subscribe(update),
      native = useAuthStore.subscribe(update),
      network = onNetworkModeChange(update);
    update();
    return () => {
      family();
      native();
      network();
    };
  };
}
