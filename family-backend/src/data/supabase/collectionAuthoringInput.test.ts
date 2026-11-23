import { describe, expect, it } from "vitest";
import { normalizeCollectionLocationFields as normalize } from "./collectionAuthoringInput";
const full = (extra = {}) => ({
  name: "Place",
  description: null,
  latitude: null,
  longitude: null,
  address: null,
  website: null,
  phone: null,
  family_place_category_id: null,
  cover_media_id: null,
  ...extra,
});
describe("Collection pre-observation normalization", () => {
  it("uses the platform URL parser and freezes the normalized intent", () => {
    const input = full({
      name: "  Kept name  ",
      website: "HTTPS://EXAMPLE.invalid:443/a/../b",
      latitude: 21.123456789,
      longitude: -100.123456789,
    });
    const result = normalize(input);
    expect(result).toMatchObject({
      name: "Kept name",
      website: "https://example.invalid/b",
      latitude: 21.12345679,
      longitude: -100.12345679,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(input.name).toBe("  Kept name  ");
  });
  it("preserves explicit empty and NULL text and internal whitespace", () => {
    expect(
      normalize(
        full({
          description: "  Notes\nline  ",
          address: "",
          website: "",
          phone: "",
        }),
      ),
    ).toMatchObject({
      description: "  Notes\nline  ",
      address: "",
      website: "",
      phone: "",
    });
  });
  it("counts Unicode characters rather than UTF-16 units", () => {
    expect(
      normalize(full({ description: "🧳".repeat(20000) })).description,
    ).toBe("🧳".repeat(20000));
    expect(() =>
      normalize(full({ description: "🧳".repeat(20001) })),
    ).toThrow();
  });
  it("normalizes UUID case before observation", () => {
    expect(
      normalize(
        { cover_media_id: "123E4567-E89B-12D3-A456-426614174000" },
        true,
      ).cover_media_id,
    ).toBe("123e4567-e89b-12d3-a456-426614174000");
  });
  it("normalizes negative zero and retains omissions in patches", () => {
    expect(
      Object.is(
        normalize({ latitude: -0.000000001, longitude: 0 }, true).latitude,
        -0,
      ),
    ).toBe(false);
    expect(normalize({ address: null }, true)).toEqual({ address: null });
  });
  it.each([
    "javascript:alert(1)",
    "data:text/plain,a",
    "ftp://fixture.invalid/",
    "https://user:pass@fixture.invalid/",
    "https://fixture.invalid/\n",
    "https:\\fixture.invalid/",
    "/relative",
    "https://fixture.invalid:99999/",
  ])("refuses unsafe or unrepresentable URL %s", (website) => {
    expect(() => normalize(full({ website }))).toThrow();
  });
  it.each([undefined, NaN, Infinity, "1", 91])(
    "refuses invalid coordinate %s",
    (latitude) => {
      expect(() => normalize(full({ latitude, longitude: 0 }))).toThrow();
    },
  );
  it.each([
    { latitude: 1 },
    { latitude: null, longitude: 1 },
    { name: "" },
    { name: null },
    { image_url: "https://fixture.invalid/a.webp" },
    { price: 0 },
    { cover_media_id: "bad" },
    { phone: "x".repeat(101) },
  ])("refuses invalid partial fields %j", (input) => {
    expect(() => normalize(input, true)).toThrow();
  });
  it("rejects incomplete full input, arrays, accessors and inherited input", () => {
    for (const input of [
      { name: "Only name" },
      [],
      null,
      new Date(),
      Object.create({ name: "Inherited" }),
      {
        get name() {
          throw new Error("getter must not run");
        },
      },
    ])
      expect(() => normalize(input)).toThrow(TypeError);
  });
});
