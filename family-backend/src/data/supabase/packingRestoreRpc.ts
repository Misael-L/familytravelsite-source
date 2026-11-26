import { getSupabaseBrowserClient } from "./client";
const names = [
  "cancel_family_trip_packing_restore_v1",
  "get_family_trip_packing_restore_cancellation_v1",
] as const;
export type PackingRestoreRpcName = (typeof names)[number];
/** Authenticated POST RPC only; no service client or arbitrary SQL/table path. */
export async function packingRestoreRpc(
  name: PackingRestoreRpcName,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!(names as readonly string[]).includes(name))
    throw new Error("Unsupported packing restore RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
}
