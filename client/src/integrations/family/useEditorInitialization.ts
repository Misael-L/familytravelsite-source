import { useState } from 'react';
import { currentPlannerBookingPort } from '../../repo/plannerBookingPort';
import { isFamilyFrontendActive } from './runtime';

/** Existing IDs survive reads; an unsaved import object identifies a deliberately different draft. */
export function useEditorInitialization(
  isOpen: boolean,
  record: { id?: number | string } | null,
  values: readonly unknown[]
) {
  const identity = record?.id ?? record;
  const [initial, setInitial] = useState<{ identity: typeof identity; values: readonly unknown[] } | null>(null);
  if (!isOpen) {
    if (initial !== null) setInitial(null);
    return values;
  }
  if (!isFamilyFrontendActive() && !currentPlannerBookingPort() && !initial) return values;
  if (!initial || initial.identity !== identity) {
    setInitial({ identity, values });
    return values;
  }
  return initial.values;
}
