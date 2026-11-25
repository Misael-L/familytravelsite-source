/** Require a fixture result without discarding valid falsy values. */
export function requireFixtureValue<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error('Expected fixture value to be present');
  }
  return value;
}
