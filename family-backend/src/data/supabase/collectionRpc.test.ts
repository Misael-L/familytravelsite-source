import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./client", () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock("./env", () => ({ getSupabaseUrl: vi.fn() }));
import { getSupabaseBrowserClient } from "./client";
import { getSupabaseUrl } from "./env";
import { collectionRpc, COLLECTION_RPCS } from "./collectionRpc";
const context = {
  source_url: "https://fixture.invalid",
  user_id: "fixture-user",
  session_id: "fixture-session",
};
function token(more: Record<string, unknown> = {}) {
  return [
    "fixture",
    btoa(
      JSON.stringify({
        sub: context.user_id,
        session_id: context.session_id,
        role: "authenticated",
        exp: Date.now() / 1000 + 3600,
        ...more,
      }),
    ),
    "fixture",
  ].join(".");
}
function fixture(more: Record<string, unknown> = {}) {
  const access_token = token(more),
    response = { data: { version: 1 }, error: null },
    setHeader = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn().mockReturnValue({ setHeader }),
    getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token, user: { id: context.user_id } } },
      error: null,
    });
  const client = { rpc, auth: { getSession } } as unknown as ReturnType<
    typeof getSupabaseBrowserClient
  >;
  vi.mocked(getSupabaseBrowserClient).mockReturnValue(client);
  vi.mocked(getSupabaseUrl).mockReturnValue(context.source_url);
  return { rpc, setHeader, getSession, access_token, response, client };
}
beforeEach(() => vi.clearAllMocks());
describe("Collection SDK scoped gateway", () => {
  it("allows all20 explicit APIs and no raw/retired endpoint", async () => {
    expect(COLLECTION_RPCS).toHaveLength(20);
    const f = fixture();
    for (const name of COLLECTION_RPCS) await collectionRpc(name, {}, context);
    expect(f.rpc).toHaveBeenCalledTimes(20);
  });
  it("refuses an unsupported endpoint before obtaining a client", async () => {
    fixture();
    vi.mocked(getSupabaseBrowserClient).mockClear();
    await expect(
      collectionRpc(
        "add_list_item" as (typeof COLLECTION_RPCS)[number],
        {},
        context,
      ),
    ).rejects.toThrow("Unsupported");
    expect(getSupabaseBrowserClient).not.toHaveBeenCalled();
  });
  it("sets the original bearer explicitly", async () => {
    const f = fixture();
    expect(
      await collectionRpc(COLLECTION_RPCS[0], { p_limit: 1 }, context),
    ).toEqual({ version: 1 });
    expect(f.setHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer " + f.access_token,
    );
  });
  it.each([
    { sub: "other" },
    { session_id: "other" },
    { role: "service_role" },
    { exp: 0 },
  ])("refuses mismatched or expired claims %j", async (claims) => {
    const f = fixture(claims);
    await expect(
      collectionRpc(COLLECTION_RPCS[0], {}, context),
    ).rejects.toMatchObject({ code: "collection_rpc_session" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("refuses a missing session", async () => {
    const f = fixture();
    f.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(
      collectionRpc(COLLECTION_RPCS[0], {}, context),
    ).rejects.toMatchObject({ code: "collection_rpc_session" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("refuses another configured source", async () => {
    const f = fixture();
    vi.mocked(getSupabaseUrl).mockReturnValue("https://other.invalid");
    await expect(
      collectionRpc(COLLECTION_RPCS[0], {}, context),
    ).rejects.toMatchObject({ code: "collection_rpc_context" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("refuses a replaced client after waiting for Auth", async () => {
    const f = fixture();
    f.getSession.mockImplementation(async () => {
      vi.mocked(getSupabaseBrowserClient).mockReturnValue(
        {} as ReturnType<typeof getSupabaseBrowserClient>,
      );
      return {
        data: {
          session: {
            access_token: f.access_token,
            user: { id: context.user_id },
          },
        },
        error: null,
      };
    });
    await expect(
      collectionRpc(COLLECTION_RPCS[0], {}, context),
    ).rejects.toMatchObject({ code: "collection_rpc_context" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("captures request fields before Auth awaits", async () => {
    const f = fixture();
    const args = { p_value: { name: "Original" } };
    f.getSession.mockImplementation(async () => {
      args.p_value.name = "Later";
      return {
        data: {
          session: {
            access_token: f.access_token,
            user: { id: context.user_id },
          },
        },
        error: null,
      };
    });
    await collectionRpc(COLLECTION_RPCS[0], args, context);
    expect(f.rpc.mock.calls[0][1]).toEqual({ p_value: { name: "Original" } });
  });
  it("propagates database refusal without empty fallback", async () => {
    const f = fixture();
    const error = { code: "42501" };
    f.setHeader.mockResolvedValue({ data: null, error });
    await expect(collectionRpc(COLLECTION_RPCS[0], {}, context)).rejects.toBe(
      error,
    );
  });
});
