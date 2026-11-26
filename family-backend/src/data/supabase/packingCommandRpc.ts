import { getSupabaseBrowserClient } from "./client";

/** One authenticated command RPC. Reads, raw tables and unrelated writers are deliberately excluded. */
export async function packingCommandRpc(
  name: "execute_family_trip_packing_v1",
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name !== "execute_family_trip_packing_v1")
    throw new Error("Unsupported packing command RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
}
