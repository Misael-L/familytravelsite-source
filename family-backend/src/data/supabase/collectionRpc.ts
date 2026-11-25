import { getSupabaseBrowserClient } from "./client";
import { getSupabaseUrl } from "./env";

export const COLLECTION_RPCS = Object.freeze([
  "get_family_collection_preparation_outcome_v2",
  "cancel_family_collection_preparation_v2",
  "get_family_collection_library_v1",
  "get_family_collection_page_v1",
  "get_family_collection_editor_v1",
  "get_family_collection_membership_v1",
  "get_family_collection_authoring_context_v1",
  "prepare_family_collection_content_v1",
  "execute_family_collection_content_v1",
  "get_family_collection_content_operation_v1",
  "cancel_family_collection_content_v1",
  "get_family_collection_context_v1",
  "get_family_collection_item_context_v1",
  "list_family_collection_trash_v1",
  "list_family_collection_item_trash_v1",
  "execute_family_collection_lifecycle_v1",
  "execute_family_collection_item_lifecycle_v1",
  "list_family_collection_versions_v1",
  "get_family_collection_operation_v1",
  "cancel_family_collection_operation_v1",
] as const);
export type CollectionRpcName = (typeof COLLECTION_RPCS)[number];
export type CollectionRpcContext = Readonly<{
  source_url: string;
  user_id: string;
  session_id: string;
}>;
export type CollectionRpc = (
  name: CollectionRpcName,
  args: Record<string, unknown>,
  context: CollectionRpcContext,
) => Promise<unknown>;
export class CollectionRpcError extends Error {
  constructor(
    readonly code: "collection_rpc_context" | "collection_rpc_session",
  ) {
    super(
      "The original Collection connection or session is unavailable. Reload or recover the original operation.",
    );
  }
}
function origin(value: string) {
  try {
    const u = new URL(value);
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash
    )
      throw new Error();
    return u.origin;
  } catch {
    throw new CollectionRpcError("collection_rpc_context");
  }
}
/** The database remains the authority. JWT fields below are only a mismatch/refusal fence. */
export const collectionRpc: CollectionRpc = async (name, args, context) => {
  if (!(COLLECTION_RPCS as readonly string[]).includes(name))
    throw new Error("Unsupported Collection RPC");
  const source = origin(context.source_url),
    user = context.user_id,
    sid = context.session_id;
  const requestArgs = structuredClone(args);
  const client = getSupabaseBrowserClient();
  const current = () => {
    if (
      origin(getSupabaseUrl()) !== source ||
      getSupabaseBrowserClient() !== client
    )
      throw new CollectionRpcError("collection_rpc_context");
  };
  current();
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  current();
  if (
    error ||
    !session ||
    session.user.id !== user ||
    session.access_token.length > 16384
  )
    throw new CollectionRpcError("collection_rpc_session");
  const token = session.access_token;
  try {
    const segments = token.split(".");
    if (segments.length !== 3) throw new Error();
    const body = JSON.parse(
      atob(segments[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (
      body.sub !== user ||
      body.session_id !== sid ||
      body.role !== "authenticated" ||
      typeof body.exp !== "number" ||
      !Number.isFinite(body.exp) ||
      body.exp <= Date.now() / 1000
    )
      throw new Error();
  } catch {
    throw new CollectionRpcError("collection_rpc_session");
  }
  // The installed SDK honors this explicit header before its ambient auth callback.
  // A token refresh can keep its session; an account switch cannot replace this bearer.
  const response = await client
    .rpc(name, requestArgs)
    .setHeader("Authorization", "Bearer " + token);
  current();
  if (response.error) throw response.error;
  return response.data as unknown;
};
