import { getSupabaseBrowserClient } from "./client";
const names = [
  "get_family_trip_packing_with_categories_v2",
  "lookup_family_trip_packing_category_v2",
  "list_family_trip_packing_category_trash_v2",
  "execute_family_trip_packing_category_lifecycle_v2",
  "get_family_trip_packing_category_lifecycle_receipt_v2",
  "execute_family_trip_packing_category_item_v2",
  "get_family_trip_packing_category_item_receipt_v2",
] as const;
export type PackingCategoryV2RpcName = (typeof names)[number];
/** Explicit v2 boundary. No raw table access, legacy name resolution or fallback. */
export async function packingCategoryV2Rpc(
  name: PackingCategoryV2RpcName,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!(names as readonly string[]).includes(name))
    throw new Error("Unsupported packing category v2 RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
}
