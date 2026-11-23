import { getSupabaseBrowserClient } from "./client";
/** Coherent content is one database RPC, never a merge of independent HTTP replies. */
export async function bookingStayReadRpc(tripId: string): Promise<unknown> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      tripId,
    )
  )
    throw new Error("Canonical Trip UUID required");
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "get_family_trip_booking_view_v2",
    { p_trip_id: tripId },
  );
  if (error) throw error;
  return data as unknown;
}
