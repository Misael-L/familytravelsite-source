import { requireFixtureValue } from './requireFixtureValue';

/** Row lookups shared by the native day-sidebar fixtures. */
export function dragRow(el: HTMLElement | null) {
  return requireFixtureValue(el).closest('[draggable="true"]') as HTMLElement;
}

export function cardRow(el: HTMLElement | null) {
  return requireFixtureValue(el).closest('[data-dp="transport-row"], [data-dp="note-row"]') as HTMLElement;
}
