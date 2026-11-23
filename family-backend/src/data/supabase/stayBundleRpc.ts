import { getSupabaseBrowserClient } from "./client";

export type StayBundleRpcArgs = {
  get_family_stay_bundle_context_v1: {
    p_trip_id: string;
    p_location_id: string;
    p_arrival_day_id: string;
    p_departure_day_id: string;
    p_stay_id: string;
    p_reservation_id: string;
  };
  create_family_stay_bundle_v1: { p_command: Record<string, unknown> };
  get_family_stay_bundle_outcome_v1: { p_command: Record<string, unknown> };
  cancel_family_stay_bundle_v1: { p_command: Record<string, unknown> };
};
const names: readonly (keyof StayBundleRpcArgs)[] = [
  "get_family_stay_bundle_context_v1",
  "create_family_stay_bundle_v1",
  "get_family_stay_bundle_outcome_v1",
  "cancel_family_stay_bundle_v1",
];
export type StayBundleRpc = <N extends keyof StayBundleRpcArgs>(
  name: N,
  args: StayBundleRpcArgs[N],
) => Promise<unknown>;
export const stayBundleRpc: StayBundleRpc = async (name, args) => {
  if (!names.includes(name)) throw new Error("Unsupported stay bundle RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
};
