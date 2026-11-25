let active: Promise<void> | null = null;
export function logoutInProgress(): boolean {
  return active !== null;
}
export async function waitForLogout(): Promise<void> {
  if (active !== null) await active;
}
/** One bounded logout owns teardown. New sign-ins wait instead of being erased by old teardown. */
export function coordinateLogout(action: () => Promise<void>): Promise<void> {
  if (active !== null) return active;
  const run = Promise.resolve().then(action);
  const result = run.finally(() => {
    if (active === result) active = null;
  });
  active = result;
  return result;
}
