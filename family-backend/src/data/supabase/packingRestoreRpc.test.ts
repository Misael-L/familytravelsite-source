import { beforeEach, describe, expect, it, vi } from "vitest";
import { packingRestoreRpc } from "./packingRestoreRpc";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));
beforeEach(() => rpc.mockReset());
describe("authenticated terminal restore RPC", () => {
  it.each([
    "cancel_family_trip_packing_restore_v1",
    "get_family_trip_packing_restore_cancellation_v1",
  ] as const)("uses installed authenticated RPC for %s", async (name) => {
    const args = { p_operation_id: "original" };
    rpc.mockResolvedValue({ data: { status: "cancelled" }, error: null });
    expect(await packingRestoreRpc(name, args)).toEqual({
      status: "cancelled",
    });
    expect(rpc).toHaveBeenCalledWith(name, args);
  });
  it("preserves service refusals for the typed transport", async () => {
    const error = { code: "42501" };
    rpc.mockResolvedValue({ error, data: null });
    await expect(
      packingRestoreRpc("cancel_family_trip_packing_restore_v1", {}),
    ).rejects.toBe(error);
  });
  it.each([
    "execute_family_trip_packing_v1",
    "select",
    "packing_command_cancellations",
  ])("refuses unrelated %s before RPC", async (name) => {
    await expect(packingRestoreRpc(name as never, {})).rejects.toThrow(
      "Unsupported",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
