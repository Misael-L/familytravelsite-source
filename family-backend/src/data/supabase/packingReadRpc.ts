import { getSupabaseBrowserClient } from "./client";

const names = [
  "get_family_trip_packing_v1",
  "list_family_trip_packing_trash_v1",
  "get_family_trip_packing_receipt_v1",
] as const;
export type PackingReadRpcName = (typeof names)[number];
/** Authenticated read/reconciliation boundary only. No raw SELECT, default creation or write fallback. */
export async function packingReadRpc(
  name: PackingReadRpcName,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!(names as readonly string[]).includes(name))
    throw new Error("Unsupported packing read RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
}
