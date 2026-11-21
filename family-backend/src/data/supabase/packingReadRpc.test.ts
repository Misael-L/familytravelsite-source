import { beforeEach, expect, it, vi } from "vitest";
import { packingReadRpc } from "./packingReadRpc";
const sdk = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./client", () => ({ getSupabaseBrowserClient: () => sdk }));
beforeEach(() => sdk.rpc.mockReset());
it("uses the current user SDK and retains raw typed-boundary data without a SELECT or default writer", async () => {
  const data = { version: 1, items: [] };
  sdk.rpc.mockResolvedValue({ data, error: null });
  expect(
    await packingReadRpc("get_family_trip_packing_v1", {
      p_trip_id: "fixture",
    }),
  ).toBe(data);
  expect(sdk.rpc).toHaveBeenCalledExactlyOnceWith(
    "get_family_trip_packing_v1",
    { p_trip_id: "fixture" },
  );
});
it("propagates denial instead of claiming an empty success", async () => {
  const error = { code: "42501" };
  sdk.rpc.mockResolvedValue({ data: null, error });
  await expect(packingReadRpc("get_family_trip_packing_v1", {})).rejects.toBe(
    error,
  );
});
it("refuses a writer or unknown RPC even if an untyped caller bypasses TypeScript", async () => {
  await expect(
    packingReadRpc("execute_family_trip_packing_v1" as never, {}),
  ).rejects.toThrow("Unsupported packing read RPC");
  expect(sdk.rpc).not.toHaveBeenCalled();
});
