import { beforeEach, expect, it, vi } from "vitest";
import { bookingStayReadRpc } from "./bookingStayReadRpc";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./client", () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));
const trip = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: { version: 2 }, error: null });
});
it("sends exactly one installed browser RPC with the canonical UUID", async () => {
  expect(await bookingStayReadRpc(trip)).toEqual({ version: 2 });
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    "get_family_trip_booking_view_v2",
    { p_trip_id: trip },
  );
});
it.each(["17", "not-a-uuid", ""])(
  "refuses numeric or invalid identity %s",
  async (value) => {
    await expect(bookingStayReadRpc(value)).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  },
);
it("propagates missing API and denied access without raw-table or v1 fallback", async () => {
  for (const code of ["42501", "PGRST202"]) {
    const error = { code };
    rpc.mockResolvedValue({ data: null, error });
    await expect(bookingStayReadRpc(trip)).rejects.toBe(error);
  }
  expect(rpc).toHaveBeenCalledTimes(2);
});
it("does not manufacture complete emptiness for a null reply", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  expect(await bookingStayReadRpc(trip)).toBeNull();
});
