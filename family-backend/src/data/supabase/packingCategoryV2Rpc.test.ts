import { beforeEach, describe, expect, it, vi } from "vitest";
import { packingCategoryV2Rpc } from "./packingCategoryV2Rpc";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));
beforeEach(() => rpc.mockReset());
describe("authenticated packing category protocol", () => {
  it.each([
    "get_family_trip_packing_with_categories_v2",
    "lookup_family_trip_packing_category_v2",
    "list_family_trip_packing_category_trash_v2",
    "execute_family_trip_packing_category_lifecycle_v2",
    "get_family_trip_packing_category_lifecycle_receipt_v2",
    "execute_family_trip_packing_category_item_v2",
    "get_family_trip_packing_category_item_receipt_v2",
  ] as const)(
    "only forwards %s through the installed browser client",
    async (name) => {
      const args = { p_trip_id: "observed" };
      rpc.mockResolvedValue({ data: { proof: true }, error: null });
      expect(await packingCategoryV2Rpc(name, args)).toEqual({ proof: true });
      expect(rpc).toHaveBeenCalledWith(name, args);
    },
  );
  it("preserves the service error for the typed transport", async () => {
    const error = { code: "PT409" };
    rpc.mockResolvedValue({ data: null, error });
    await expect(
      packingCategoryV2Rpc(
        "execute_family_trip_packing_category_lifecycle_v2",
        {},
      ),
    ).rejects.toBe(error);
  });
  it("refuses raw or wrong-domain calls even from untyped input", async () => {
    await expect(
      packingCategoryV2Rpc("packing_categories" as never, {}),
    ).rejects.toThrow("Unsupported");
    expect(rpc).not.toHaveBeenCalled();
  });
});
