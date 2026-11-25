/** Keep a stable exported proxy while each database module manages its own connection. */
export function createOfflineDatabaseProxy<Database extends object>(current: () => Database): Database {
  return new Proxy({} as Database, {
    get(_target, property) {
      const value = (current() as Record<PropertyKey, unknown>)[property];
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(current()) : value;
    },
    set(_target, property, value) {
      (current() as Record<PropertyKey, unknown>)[property] = value;
      return true;
    },
  });
}
