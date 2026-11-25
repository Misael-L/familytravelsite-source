import { beforeEach, expect, it, vi } from "vitest";
import { stayAuthIdentity, stayRpc, type StayRpcArgs } from "./stayRpc";
const state = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock("./client", () => ({
  getSupabaseBrowserClient: () => ({
    rpc: state.rpc,
    auth: { getSession: state.getSession },
  }),
}));
const user = "11111111-1111-4111-8111-111111111111",
  sid = "22222222-2222-4222-8222-222222222222";
function session(claims: Record<string, unknown> = {}) {
  return {
    access_token:
      "header." +
      btoa(
        JSON.stringify({
          sub: user,
          session_id: sid,
          exp: Date.now() / 1000 + 3600,
          ...claims,
        }),
      ) +
      ".signature",
    user: { id: user },
    expires_at: Date.now() / 1000 + 3600,
  };
}
beforeEach(() => {
  state.rpc
    .mockReset()
    .mockResolvedValue({ data: { version: 1 }, error: null });
  state.getSession
    .mockReset()
    .mockResolvedValue({ data: { session: session() }, error: null });
});
it.each([
  "get_family_trip_stay_view_v1",
  "get_family_stay_editor_v1",
  "get_family_stay_command_context_v1",
  "save_family_stay_v1",
  "set_family_stay_booking_link_v1",
  "trash_family_stay_v1",
  "restore_family_stay_v1",
  "get_family_stay_history_v1",
  "get_family_stay_command_outcome_v1",
  "cancel_family_stay_command_v1",
] as const)("forwards only installed browser RPC %s", async (name) => {
  const args = { p_trip_id: user } as StayRpcArgs[typeof name];
  await expect(stayRpc(name, args)).resolves.toEqual({ version: 1 });
  expect(state.rpc).toHaveBeenCalledWith(name, args);
});
it("refuses arbitrary RPC names and propagates database refusals", async () => {
  await expect(stayRpc("raw_tables" as never, {} as never)).rejects.toThrow(
    "Unsupported",
  );
  expect(state.rpc).not.toHaveBeenCalled();
  const error = { code: "42501" };
  state.rpc.mockResolvedValue({ data: null, error });
  await expect(
    stayRpc("get_family_trip_stay_view_v1", { p_trip_id: user }),
  ).rejects.toBe(error);
});
it("returns only transient user/session IDs; refreshed tokens keep the same fence", async () => {
  await expect(stayAuthIdentity()).resolves.toEqual({
    user_id: user,
    session_id: sid,
  });
  expect(JSON.stringify(await stayAuthIdentity())).not.toContain("signature");
});
it.each([{ sub: sid }, { session_id: "not-an-id" }, { exp: 1 }])(
  "rejects inconsistent or expired token claims %j",
  async (claims) => {
    state.getSession.mockResolvedValue({
      data: { session: session(claims) },
      error: null,
    });
    await expect(stayAuthIdentity()).rejects.toBeDefined();
  },
);
it("rejects missing sessions", async () => {
  state.getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(stayAuthIdentity()).rejects.toBeDefined();
});
