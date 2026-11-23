import { getSupabaseBrowserClient } from "./client";
export type NativeStayRpcArgs = {
  get_family_native_stay_context_v1: {
    p_inner: Record<string, unknown>;
    p_arrival_visit_id: string;
    p_keep_stop: boolean;
  };
  execute_family_native_stay_v1: { p_command: Record<string, unknown> };
  get_family_native_stay_outcome_v1: { p_command: Record<string, unknown> };
  cancel_family_native_stay_v1: { p_command: Record<string, unknown> };
  get_family_native_stay_view_v1: { p_trip_id: string };
  list_family_trashed_stays_v1: {
    p_trip_id: string;
    p_after: Record<string, unknown> | null;
    p_limit: number;
  };
};
const names: readonly (keyof NativeStayRpcArgs)[] = [
  "get_family_native_stay_context_v1",
  "execute_family_native_stay_v1",
  "get_family_native_stay_outcome_v1",
  "cancel_family_native_stay_v1",
  "get_family_native_stay_view_v1",
  "list_family_trashed_stays_v1",
];
export type NativeStayRpc = <N extends keyof NativeStayRpcArgs>(
  name: N,
  args: NativeStayRpcArgs[N],
) => Promise<unknown>;
export const nativeStayRpc: NativeStayRpc = async (name, args) => {
  if (!names.includes(name)) throw new Error("Unsupported native stay RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
};
