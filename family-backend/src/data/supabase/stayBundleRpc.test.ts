import { beforeEach, expect, it, vi } from "vitest";
import { stayBundleRpc, type StayBundleRpcArgs } from "./stayBundleRpc";
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: state.rpc }),
}));
beforeEach(() =>
  state.rpc
    .mockReset()
    .mockResolvedValue({ data: { format: "fixture" }, error: null }),
);
it.each([
  "get_family_stay_bundle_context_v1",
  "create_family_stay_bundle_v1",
  "get_family_stay_bundle_outcome_v1",
  "cancel_family_stay_bundle_v1",
] as const)("uses only the separate installed RPC %s", async (name) => {
  const args = {
    p_command: { operation_id: "unchanged" },
  } as StayBundleRpcArgs[typeof name];
  await expect(stayBundleRpc(name, args)).resolves.toEqual({
    format: "fixture",
  });
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith(name, args);
});
it("does not dispatch an old dialect or arbitrary function", async () => {
  await expect(
    stayBundleRpc("save_family_stay_v1" as never, {} as never),
  ).rejects.toThrow("Unsupported");
  expect(state.rpc).not.toHaveBeenCalled();
});
it("propagates the actual database error without fake success", async () => {
  const error = { code: "42501" };
  state.rpc.mockResolvedValue({ data: null, error });
  await expect(
    stayBundleRpc("create_family_stay_bundle_v1", { p_command: {} }),
  ).rejects.toBe(error);
});
