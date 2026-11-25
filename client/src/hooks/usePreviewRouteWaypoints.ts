import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { apiClient } from '../api/client';
import { waypointViewSchema, type WaypointSave, type WaypointView } from '../integrations/family/routeWaypointContract';
import { useNetworkMode } from './useNetworkMode';

const useWaypointRefresh = create<{ revisions: Record<string, number> }>(() => ({ revisions: {} }));

function resource(tripId: number | string) {
  return `/trips/${tripId}/family/route-waypoints`;
}

export function refreshPreviewRouteWaypoints(tripId: number | string) {
  useWaypointRefresh.setState(({ revisions }) => ({
    revisions: { ...revisions, [String(tripId)]: (revisions[String(tripId)] ?? 0) + 1 },
  }));
}

export async function savePreviewWaypoint(tripId: number | string, leg: WaypointSave) {
  try {
    await apiClient.put(resource(tripId), leg);
  } finally {
    refreshPreviewRouteWaypoints(tripId);
  }
}

export function usePreviewRouteWaypoints(tripId: number | string | null, enabled: boolean) {
  const { offline } = useNetworkMode();
  const refresh = useWaypointRefresh(state => state.revisions[String(tripId)] ?? 0);
  const [loaded, setLoaded] = useState<{ tripId: number | string; view: WaypointView } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || !tripId || offline) return;
    let active = true;
    async function load() {
      if (!tripId) return;
      try {
        const saved = await apiClient.get(resource(tripId));
        const view = waypointViewSchema.parse(saved.data);
        if (!active) return;
        setLoaded({ tripId, view });
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      }
    }
    void load();
    return () => { active = false; };
  }, [tripId, enabled, offline, refresh]);
  return {
    view: enabled && loaded?.tripId === tripId ? loaded?.view ?? null : null,
    offline,
    failed,
  };
}
