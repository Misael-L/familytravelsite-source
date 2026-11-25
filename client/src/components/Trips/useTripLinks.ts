import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { tripLinksRepo } from '../../repo/tripLinksRepo';
import { refusedOffline } from '../../utils/needsConnection';
import { useStayActionScope, useStayState } from '../Planner/stayActionScope';
import { useToast } from '../shared/Toast';
import { createLinkLifetime, type LinkState } from './linkLifetime';
import type { SharePerm, SharePerms } from './tripLinkContract';
import { useLinkCopy } from './useLinkCopy';
const NO_PERMISSIONS: Record<string, boolean> = {};

function useTripLinkState<P extends Record<string, boolean>>(tripId: number, path: string, defaults: P) {
  const capture = useStayActionScope(tripId);
  const initial = useMemo<LinkState<P>>(
    () => ({ token: null, loading: true, busy: false, perms: defaults }),
    [defaults]
  );
  const [state, publish] = useStayState(capture, initial);
  const lifetime = useMemo(() => createLinkLifetime(capture, initial, publish), [capture, initial, publish]);
  const url = state.token ? `${window.location.origin}/${path}/${state.token}` : null;
  const valid = useCallback(() => lifetime.peek().token === state.token, [lifetime, state.token]);
  const copy = useLinkCopy(capture, url, valid);
  return { ...state, ...copy, capture, lifetime, url };
}
export function usePublicTripLink(tripId: number, defaults: SharePerms) {
  const link = useTripLinkState(tripId, 'shared', defaults),
    { lifetime, capture } = link;
  const toast = useToast(),
    { t } = useTranslation();
  useEffect(() => {
    void lifetime.load(
      () => tripLinksRepo.share.get(tripId),
      (data) => ({
        token: data.token ?? null,
        ...(data.token
          ? {
              perms: Object.fromEntries(
                Object.entries(defaults).map(([key, fallback]) => [key, data[key as SharePerm] ?? fallback])
              ) as SharePerms,
            }
          : {}),
      })
    );
  }, [lifetime, tripId, defaults]);
  const create = async () => {
    if (!capture().current() || refusedOffline(toast, t)) return;
    const permissions = lifetime.peek().perms;
    await lifetime.execute(
      'create',
      async (action) => {
        const data = await action.perform(() => tripLinksRepo.share.create(tripId, permissions));
        lifetime.change({ token: data.token ?? null });
      },
      () => toast.error(t('share.createError'))
    );
  };
  const setPerm = async (key: SharePerm, value: boolean) => {
    if (!capture().current()) return;
    const current = lifetime.peek();
    if (current.token && refusedOffline(toast, t)) return;
    const next = { ...current.perms, [key]: value };
    lifetime.stage(next);
    await lifetime.execute(
      undefined,
      async (action) => {
        if (lifetime.peek().token) await action.perform(() => tripLinksRepo.share.create(tripId, next));
      },
      () => toast.error(t('share.createError'))
    );
  };
  const remove = async () => {
    if (!capture().current() || refusedOffline(toast, t)) return;
    await lifetime.execute(
      'remove',
      async (action) => {
        await action.perform(() => tripLinksRepo.share.remove(tripId));
        lifetime.change({ token: null });
      },
      () => toast.error(t('common.error'))
    );
  };
  return {
    loading: link.loading,
    url: link.url,
    perms: link.perms,
    copied: link.copied,
    copy: link.copy,
    create,
    setPerm,
    remove,
  };
}
export function useInviteTripLink(tripId: number) {
  const link = useTripLinkState(tripId, 'join', NO_PERMISSIONS),
    { lifetime, capture } = link;
  const toast = useToast(),
    { t } = useTranslation();
  useEffect(() => {
    void lifetime.load(
      () => tripLinksRepo.invite.get(tripId),
      (data) => ({ token: data.token ?? null })
    );
  }, [lifetime, tripId]);
  const create = async () => {
    if (!capture().current() || refusedOffline(toast, t)) return;
    await lifetime.execute(
      'create',
      async (action) => {
        const data = await action.perform(() => tripLinksRepo.invite.create(tripId));
        lifetime.change({ token: data.token ?? null });
      },
      () => toast.error(t('share.createError'))
    );
  };
  const remove = async () => {
    if (!capture().current() || refusedOffline(toast, t)) return;
    await lifetime.execute(
      'remove',
      async (action) => {
        await action.perform(() => tripLinksRepo.invite.remove(tripId));
        lifetime.change({ token: null });
      },
      () => toast.error(t('common.error'))
    );
  };
  return {
    loading: link.loading,
    url: link.url,
    busy: link.busy,
    copied: link.copied,
    copy: link.copy,
    create,
    remove,
  };
}
