import { beforeEach, expect, it, vi } from "vitest";
import { packingGroupRpc } from "./packingGroupRpc";
const sdk = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./client", () => ({ getSupabaseBrowserClient: () => sdk }));
beforeEach(() => sdk.rpc.mockReset());
it.each([
  "execute_family_trip_packing_group_v1",
  "get_family_trip_packing_group_receipt_v1",
] as const)("uses the current authenticated SDK for %s", async (name) => {
  const data = { operation_id: "fixture" },
    args = { p_operation_id: "original" };
  sdk.rpc.mockResolvedValue({ data, error: null });
  expect(await packingGroupRpc(name, args)).toBe(data);
  expect(sdk.rpc).toHaveBeenCalledExactlyOnceWith(name, args);
});
it("propagates the actual database refusal", async () => {
  const error = { code: "42501" };
  sdk.rpc.mockResolvedValue({ data: null, error });
  await expect(
    packingGroupRpc("execute_family_trip_packing_group_v1", {}),
  ).rejects.toBe(error);
});
it.each([
  "execute_family_trip_packing_v1",
  "get_family_trip_packing_v1",
  "apply_packing_template",
  "execute_family_trip_task_v1",
])("refuses unrelated RPC %s", async (name) => {
  await expect(packingGroupRpc(name as never, {})).rejects.toThrow(
    "Unsupported packing group RPC",
  );
  expect(sdk.rpc).not.toHaveBeenCalled();
});
