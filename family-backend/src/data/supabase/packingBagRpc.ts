import { getSupabaseBrowserClient } from "./client";
const names = [
  "get_family_trip_packing_bags_v1",
  "get_family_trip_packing_bag_v1",
  "list_family_trip_packing_bag_trash_v1",
  "execute_family_trip_packing_bag_v1",
  "get_family_trip_packing_bag_receipt_v1",
] as const;
export type PackingBagRpcName = (typeof names)[number];
/** Dedicated bag protocol, using only the authenticated installed browser client. */
export async function packingBagRpc(
  name: PackingBagRpcName,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!(names as readonly string[]).includes(name))
    throw new Error("Unsupported packing bag RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
}
