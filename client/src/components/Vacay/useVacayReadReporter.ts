import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from '../../i18n';
import { captureReadSession } from '../../sync/readSession';
import { getApiErrorMessage } from '../../types';
import { useToast } from '../shared/Toast';

/** Background failures are visible only to their original mounted calendar/session. */
export function useVacayReadReporter() {
  const toast = useToast(),
    { t } = useTranslation();
  const generation = useRef(0);
  const report = useRef((error: unknown) => toast.error(getApiErrorMessage(error, t('common.error'))));
  useLayoutEffect(() => {
    report.current = (error) => toast.error(getApiErrorMessage(error, t('common.error')));
  }, [toast, t]);
  useEffect(() => {
    const mounted = ++generation.current;
    return () => {
      generation.current = mounted + 1;
    };
  }, []);
  return useCallback((read: () => Promise<unknown>) => {
    const started = generation.current,
      session = captureReadSession();
    const current = () => started === generation.current && session.current();
    void Promise.resolve()
      .then(() => {
        if (current()) return read();
      })
      .catch((error) => {
        if (current()) report.current(error);
      });
  }, []);
}
