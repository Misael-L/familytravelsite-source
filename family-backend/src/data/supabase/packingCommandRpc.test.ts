import { beforeEach, expect, it, vi } from "vitest";
import { packingCommandRpc } from "./packingCommandRpc";
const sdk = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./client", () => ({ getSupabaseBrowserClient: () => sdk }));
beforeEach(() => sdk.rpc.mockReset());
it("uses the current authenticated SDK for the single packing command", async () => {
  const data = { operation_id: "fixture" }, args = { p_operation_id: "original" };
  sdk.rpc.mockResolvedValue({ data, error: null });
  expect(await packingCommandRpc("execute_family_trip_packing_v1", args)).toBe(data);
  expect(sdk.rpc).toHaveBeenCalledExactlyOnceWith("execute_family_trip_packing_v1", args);
});
it("propagates database denial", async () => {
  const error = { code: "42501" };
  sdk.rpc.mockResolvedValue({ data: null, error });
  await expect(packingCommandRpc("execute_family_trip_packing_v1", {})).rejects.toBe(error);
});
it.each(["get_family_trip_packing_v1", "apply_packing_template", "execute_family_trip_task_v1"])("refuses unrelated RPC %s", async name => {
  await expect(packingCommandRpc(name as never, {})).rejects.toThrow("Unsupported packing command RPC");
  expect(sdk.rpc).not.toHaveBeenCalled();
});
