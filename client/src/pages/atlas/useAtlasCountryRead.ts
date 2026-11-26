import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/shared/Toast';
import { useTranslation } from '../../i18n';
import { readAtlasCountry } from '../../repo/atlasRead';
import type { AtlasReadState, CountryDetail } from './atlasModel';

/** Selected-country reads are independently owned, including error/selection retirement. */
export function useAtlasCountryRead({
  family,
  captureCurrent,
  subscribeRetirement,
}: {
  family: boolean;
  captureCurrent: () => () => boolean;
  subscribeRetirement: (listener: () => void) => () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countryDetail, setCountryDetail] = useState<CountryDetail | null>(null);
  const [countryReadState, setCountryReadState] = useState<AtlasReadState>({ status: 'loading' });
  const [placesOpen, setPlacesOpen] = useState(false);
  const version = useRef(0);
  useEffect(
    () =>
      subscribeRetirement(() => {
        version.current++;
        setSelectedCountry(null);
        setCountryDetail(null);
        setCountryReadState({ status: 'loading' });
        setPlacesOpen(false);
      }),
    [subscribeRetirement]
  );
  const loadCountryDetail = useCallback(
    async (code: string): Promise<void> => {
      const current = captureCurrent();
      if (!current()) return;
      const request = ++version.current;
      setSelectedCountry(code);
      setCountryDetail(null);
      setCountryReadState({ status: 'loading' });
      try {
        const result = await readAtlasCountry(code);
        if (!current() || version.current !== request) return;
        setCountryDetail(result.data);
        setCountryReadState({ status: 'ready' });
      } catch (error) {
        if (!current() || version.current !== request) return;
        const unavailable = (error as { response?: { status?: number } }).response?.status === 501;
        setCountryReadState({ status: unavailable ? 'unavailable' : 'error' });
        if (family) toast.error(t(unavailable ? 'atlas.unavailable' : 'common.errorPanelTitle'));
      }
    },
    [captureCurrent, family, t, toast]
  );
  return {
    selectedCountry,
    setSelectedCountry,
    countryDetail,
    setCountryDetail,
    countryReadState,
    placesOpen,
    setPlacesOpen,
    loadCountryDetail,
  };
}
