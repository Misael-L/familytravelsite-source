import { beforeEach, describe, expect, it, vi } from "vitest";
import { packingBagCancellationRpc } from "./packingBagCancellationRpc";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));
beforeEach(() => rpc.mockReset());
describe("authenticated terminal non-restore bag RPC", () => {
  it.each([
    "cancel_family_trip_packing_bag_command_v1",
    "get_family_trip_packing_bag_command_cancellation_v1",
  ] as const)("uses installed authenticated RPC for %s", async (name) => {
    const args = { p_operation_id: "original" };
    rpc.mockResolvedValue({ data: { status: "cancelled" }, error: null });
    expect(await packingBagCancellationRpc(name, args)).toEqual({
      status: "cancelled",
    });
    expect(rpc).toHaveBeenCalledWith(name, args);
  });
  it("preserves service refusals for the typed transport", async () => {
    const error = { code: "42501" };
    rpc.mockResolvedValue({ error, data: null });
    await expect(
      packingBagCancellationRpc(
        "cancel_family_trip_packing_bag_command_v1",
        {},
      ),
    ).rejects.toBe(error);
  });
  it.each([
    "execute_family_trip_packing_v1",
    "select",
    "packing_command_cancellations",
  ])("refuses unrelated %s before RPC", async (name) => {
    await expect(packingBagCancellationRpc(name as never, {})).rejects.toThrow(
      "Unsupported",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
