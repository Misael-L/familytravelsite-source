import { getSupabaseBrowserClient } from "./client";
import type { LibraryRpc } from "./collectionLibrary";

/** Read-only allowlist; no raw table fallback or fabricated empty library. */
export const collectionLibraryRpc: LibraryRpc = async (name, args) => {
  if (name !== "get_family_collection_library_v1")
    throw new Error("Unsupported Collection library RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
};
