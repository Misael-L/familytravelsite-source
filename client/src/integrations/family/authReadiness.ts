/** Cached display identity is insufficient for Family account data. */
export function accountDataReady(input: {
  authenticated: boolean;
  loading: boolean;
  familyActive: boolean;
  familyReady: boolean;
}): boolean {
  if (!input.authenticated) return false;
  if (!input.familyActive) return true;
  return !input.loading && input.familyReady;
}

/** Public routes and unvalidated Family sessions keep account widgets unmounted. */
export function hideAccountWidgets(input: {
  authPage: boolean;
  publicPage: boolean;
  familyActive: boolean;
  dataReady: boolean;
}): boolean {
  return input.authPage || input.publicPage || (input.familyActive && !input.dataReady);
}
