import { getSupabaseBrowserClient } from "./client";
const names = [
  "get_family_trip_packing_category_lane_v3",
  "get_family_trip_packing_category_aggregate_v3",
  "list_family_trip_packing_category_batches_v3",
  "execute_family_trip_packing_category_aggregate_v3",
  "get_family_trip_packing_category_aggregate_receipt_v3",
] as const;
export type PackingCategoryAggregateRpcName = (typeof names)[number];
/** Explicit aggregate domain; no table writes or fallback to an older command. */
export async function packingCategoryAggregateRpc(
  name: PackingCategoryAggregateRpcName,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!(names as readonly string[]).includes(name))
    throw new Error("Unsupported packing category aggregate RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
}
