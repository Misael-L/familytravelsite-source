/** Normalize location intent BEFORE requesting a database observation/original.
 * This helper is deliberately not wired to native controls in this packet. */
const FIELDS = [
  "name",
  "description",
  "latitude",
  "longitude",
  "address",
  "website",
  "phone",
  "family_place_category_id",
  "cover_media_id",
] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Value = string | number | null;
const hasOwn = (object: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(object, key);
function invalid(): never {
  throw new TypeError("Invalid Collection location intent");
}
export function normalizeCollectionLocationFields(
  input: unknown,
  partial = false,
): Readonly<Record<string, Value>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) invalid();
  const keys = Reflect.ownKeys(input);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" || !(FIELDS as readonly string[]).includes(key),
    )
  )
    invalid();
  if (!partial && FIELDS.some((key) => !hasOwn(input, key))) invalid();
  if (hasOwn(input, "latitude") !== hasOwn(input, "longitude")) invalid();
  const result: Record<string, Value> = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !hasOwn(descriptor, "value")) invalid();
    const value: unknown = descriptor.value;
    if (key === "latitude" || key === "longitude") {
      if (value === null) {
        result[key] = null;
        continue;
      }
      const bound = key === "latitude" ? 90 : 180;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        Math.abs(value) > bound
      )
        invalid();
      const rounded = Number(value.toFixed(8));
      result[key] = Object.is(rounded, -0) ? 0 : rounded;
      continue;
    }
    if (value === null) {
      if (key === "name") invalid();
      result[key] = null;
      continue;
    }
    if (typeof value !== "string") invalid();
    if (key === "family_place_category_id" || key === "cover_media_id") {
      if (!UUID.test(value)) invalid();
      result[key] = value.toLowerCase();
      continue;
    }
    if (key === "website" && value !== "") {
      if (/[\u0000-\u0020\u007f\\]/.test(value)) invalid();
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        invalid();
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        invalid();
      if (url.href.length > 2048) invalid();
      result[key] = url.href;
      continue;
    }
    const normalized = key === "name" ? value.trim() : value;
    const limit =
      key === "name"
        ? 500
        : key === "description"
          ? 20000
          : key === "address"
            ? 2000
            : key === "phone"
              ? 100
              : 2048;
    if (
      (key === "name" && normalized === "") ||
      Array.from(normalized).length > limit
    )
      invalid();
    result[key] = normalized;
  }
  if (
    hasOwn(result, "latitude") &&
    (result.latitude === null) !== (result.longitude === null)
  )
    invalid();
  return Object.freeze(result);
}
