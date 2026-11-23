import { getSupabaseBrowserClient } from "./client";

export type PackingGroupRpcName =
  | "execute_family_trip_packing_group_v1"
  | "get_family_trip_packing_group_receipt_v1";
/** Dedicated authenticated group commands/receipts. Never a raw table or an item loop. */
export async function packingGroupRpc(
  name: PackingGroupRpcName,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (
    name !== "execute_family_trip_packing_group_v1" &&
    name !== "get_family_trip_packing_group_receipt_v1"
  )
    throw new Error("Unsupported packing group RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
}
