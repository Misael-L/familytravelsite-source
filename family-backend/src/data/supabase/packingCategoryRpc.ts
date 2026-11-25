import { getSupabaseBrowserClient } from "./client";

export type PackingCategoryRpcName =
  | "get_family_trip_packing_with_categories_v1"
  | "execute_family_trip_packing_category_v1"
  | "get_family_trip_packing_category_receipt_v1";
/** Explicit category protocol only; no raw category or legacy label writers. */
export async function packingCategoryRpc(
  name: PackingCategoryRpcName,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (
    ![
      "get_family_trip_packing_with_categories_v1",
      "execute_family_trip_packing_category_v1",
      "get_family_trip_packing_category_receipt_v1",
    ].includes(name)
  )
    throw new Error("Unsupported packing category RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
}
