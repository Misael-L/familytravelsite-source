import { beforeEach, describe, expect, it, vi } from "vitest";
import { packingCategoryRpc } from "./packingCategoryRpc";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));
beforeEach(() => rpc.mockReset());
describe("authenticated packing category protocol", () => {
  it.each([
    "get_family_trip_packing_with_categories_v1",
    "execute_family_trip_packing_category_v1",
    "get_family_trip_packing_category_receipt_v1",
  ] as const)(
    "only forwards %s through the installed browser client",
    async (name) => {
      const args = { p_trip_id: "observed" };
      rpc.mockResolvedValue({ data: { proof: true }, error: null });
      expect(await packingCategoryRpc(name, args)).toEqual({ proof: true });
      expect(rpc).toHaveBeenCalledWith(name, args);
    },
  );
  it("preserves the service error for the typed transport", async () => {
    const error = { code: "PT409" };
    rpc.mockResolvedValue({ data: null, error });
    await expect(
      packingCategoryRpc("execute_family_trip_packing_category_v1", {}),
    ).rejects.toBe(error);
  });
  it("refuses raw or wrong-domain calls even from untyped input", async () => {
    await expect(
      packingCategoryRpc("packing_categories" as never, {}),
    ).rejects.toThrow("Unsupported");
    expect(rpc).not.toHaveBeenCalled();
  });
});
