import { beforeEach, expect, it, vi } from "vitest";
import { nativeStayRpc, type NativeStayRpcArgs } from "./nativeStayRpc";
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: state.rpc }),
}));
beforeEach(() =>
  state.rpc
    .mockReset()
    .mockResolvedValue({ data: { format: "synthetic" }, error: null }),
);
it.each([
  "get_family_native_stay_context_v1",
  "execute_family_native_stay_v1",
  "get_family_native_stay_outcome_v1",
  "cancel_family_native_stay_v1",
  "get_family_native_stay_view_v1",
  "list_family_trashed_stays_v1",
] as const)("dispatches only the exact native RPC %s", async (name) => {
  const args = {
    p_command: { operation_id: "original" },
  } as NativeStayRpcArgs[typeof name];
  expect(await nativeStayRpc(name, args)).toEqual({ format: "synthetic" });
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith(name, args);
});
it("refuses a legacy or arbitrary RPC", async () => {
  await expect(
    nativeStayRpc("save_family_stay_v1" as never, {} as never),
  ).rejects.toThrow("Unsupported");
  expect(state.rpc).not.toHaveBeenCalled();
});
it("propagates a real refusal", async () => {
  const error = { code: "42501" };
  state.rpc.mockResolvedValue({ data: null, error });
  await expect(
    nativeStayRpc("execute_family_native_stay_v1", { p_command: {} }),
  ).rejects.toBe(error);
});
