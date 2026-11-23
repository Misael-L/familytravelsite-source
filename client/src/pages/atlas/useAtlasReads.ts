import type { AxiosResponse } from 'axios';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PluginAtlasLayer } from '../../api/client';
import { captureFamilyActor, observeFamilyActor, onFamilyActorChange } from '../../integrations/family/actorContext';
import { isFamilyFrontendActive } from '../../integrations/family/runtime';
import { readAtlasSection } from '../../repo/atlasRead';
import type { GeoJsonFeatureCollection } from '../../types';
import { A2_TO_A3, type AtlasData, type AtlasReadSection, type AtlasReadState, type BucketItem } from './atlasModel';
import type { VisitedRegionMap } from './useAtlasCountryActions';

const sections = ['stats', 'geography', 'bucket', 'regions', 'layers'] as const;

const initial = (): Record<AtlasReadSection, AtlasReadState> => ({
  stats: { status: 'loading' },
  geography: { status: 'loading' },
  bucket: { status: 'loading' },
  regions: { status: 'loading' },
  layers: { status: 'loading' },
});

function rememberCountryCodes(features: GeoJsonFeatureCollection['features']) {
  for (const feature of features) {
    const a2 = feature.properties?.ISO_A2;
    const a3 = feature.properties?.ADM0_A3 || feature.properties?.ISO_A3;
    if (
      typeof a2 === 'string' &&
      typeof a3 === 'string' &&
      a2.length === 2 &&
      a2 !== '-99' &&
      a3 !== '-99' &&
      !A2_TO_A3[a2]
    )
      A2_TO_A3[a2] = a3;
  }
}

function useAtlasData() {
  const [data, setData] = useState<AtlasData | null>(null);
  const [geoData, setGeoData] = useState<GeoJsonFeatureCollection | null>(null);
  const [bucketList, setBucketList] = useState<BucketItem[]>([]);
  const [visitedRegions, setVisitedRegions] = useState<VisitedRegionMap>({});
  const [pluginLayers, setPluginLayers] = useState<PluginAtlasLayer[]>([]);
  const clear = useCallback((section: AtlasReadSection) => {
    if (section === 'stats') setData(null);
    else if (section === 'geography') setGeoData(null);
    else if (section === 'bucket') setBucketList([]);
    else if (section === 'regions') setVisitedRegions({});
    else setPluginLayers([]);
  }, []);

  const publish = useCallback((section: AtlasReadSection, value: AxiosResponse['data']) => {
    if (section === 'stats') {
      if (!value || !Array.isArray(value.countries) || !value.stats) throw new Error('Invalid Atlas statistics');
      setData(value);
    } else if (section === 'geography') {
      if (!value || !Array.isArray(value.features)) throw new Error('Invalid Atlas geography');
      rememberCountryCodes(value.features);
      setGeoData(value);
    } else if (section === 'bucket') {
      if (!Array.isArray(value?.items)) throw new Error('Invalid Atlas bucket list');
      setBucketList(value.items);
    } else if (section === 'regions') {
      if (!value?.regions || typeof value.regions !== 'object' || Array.isArray(value.regions))
        throw new Error('Invalid Atlas regions');
      setVisitedRegions(value.regions);
    } else {
      if (!Array.isArray(value?.layers)) throw new Error('Invalid Atlas layers');
      setPluginLayers(value.layers);
    }
  }, []);

  return {
    data,
    setData,
    geoData,
    bucketList,
    setBucketList,
    visitedRegions,
    setVisitedRegions,
    pluginLayers,
    clear,
    publish,
  };
}

function useAtlasRetirement() {
  const retirementListeners = useRef(new Set<() => void>());
  const subscribeRetirement = useCallback((listener: () => void) => {
    retirementListeners.current.add(listener);
    return () => {
      retirementListeners.current.delete(listener);
    };
  }, []);

  return { retirementListeners, subscribeRetirement };
}

/** Independent reads share an owner lifetime, never each other's success/failure. */
export function useAtlasReads() {
  const family = isFamilyFrontendActive();
  const {
    data,
    setData,
    geoData,
    bucketList,
    setBucketList,
    visitedRegions,
    setVisitedRegions,
    pluginLayers,
    clear,
    publish,
  } = useAtlasData();
  const [states, setStates] = useState(initial);
  const [ownerEpoch, setOwnerEpoch] = useState(0);
  const lifetime = useRef(0);
  const mounted = useRef(false);
  const versions = useRef<Record<string, number>>({});
  const controllers = useRef<Partial<Record<AtlasReadSection, AbortController>>>({});
  const statesRef = useRef(states);
  useLayoutEffect(() => {
    statesRef.current = states;
  }, [states]);
  const { retirementListeners, subscribeRetirement } = useAtlasRetirement();

  const captureCurrent = useCallback(() => {
    const generation = ownerEpoch;
    const actor = family ? captureFamilyActor() : null;
    return () => mounted.current && generation === lifetime.current && (!actor || actor.current());
  }, [family, ownerEpoch]);

  const load = useCallback(
    async (section: AtlasReadSection) => {
      const isCurrent = captureCurrent();
      if (!isCurrent()) return;
      const version = (versions.current[section] = (versions.current[section] ?? 0) + 1);
      const current = () => isCurrent() && versions.current[section] === version;
      controllers.current[section]?.abort();
      const controller = new AbortController();
      controllers.current[section] = controller;
      if (!current()) return;
      clear(section);
      setStates((previous) => ({ ...previous, [section]: { status: 'loading' } }));
      try {
        const result = await readAtlasSection(section, controller.signal);
        if (!current()) return;
        publish(section, result.data);
        if (current()) setStates((previous) => ({ ...previous, [section]: { status: 'ready' } }));
      } catch (error) {
        if (!current()) return;
        const status = (error as { response?: { status?: number } })?.response?.status;
        setStates((previous) => ({ ...previous, [section]: { status: status === 501 ? 'unavailable' : 'error' } }));
      }
    },
    [captureCurrent, clear, publish]
  );

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const activeControllers = controllers.current;
    if (family) observeFamilyActor();
    const retire = () => {
      lifetime.current++;
      for (const section of sections) {
        controllers.current[section]?.abort();
        clear(section);
      }
      setStates(initial());
      for (const listener of retirementListeners.current) listener();
      setOwnerEpoch((epoch) => epoch + 1);
    };
    const release = family ? onFamilyActorChange(retire) : () => {};
    void Promise.resolve().then(() => {
      if (!cancelled && mounted.current && ownerEpoch === lifetime.current)
        for (const section of sections) void load(section);
    });
    return () => {
      cancelled = true;
      mounted.current = false;
      release();
      for (const section of sections) activeControllers[section]?.abort();
    };
  }, [family, load, clear, ownerEpoch, retirementListeners]);

  const retryRead = useCallback(
    (section: AtlasReadSection) => {
      if (statesRef.current[section].status === 'error') void load(section);
    },
    [load]
  );
  const reloadAfterDawarich = useCallback(() => {
    for (const section of ['stats', 'bucket'] as const) {
      if (statesRef.current[section].status !== 'unavailable') void load(section);
    }
  }, [load]);
  return {
    data,
    setData,
    geoData,
    bucketList,
    setBucketList,
    visitedRegions,
    setVisitedRegions,
    pluginLayers,
    availability: { ...states, family },
    retryRead,
    reloadAfterDawarich,
    ownerEpoch,
    captureCurrent,
    subscribeRetirement,
    loading: !family && (states.stats.status === 'loading' || states.bucket.status === 'loading'),
  };
}
