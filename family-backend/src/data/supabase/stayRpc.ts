import { getSupabaseBrowserClient } from "./client";
export type StayScope = {
  version: 1;
  layer: "published";
  trip_id: string;
  family_id: string;
  user_id: string;
  person_id: string;
  session_id: string;
};
type Original = {
  p_trip_id: string;
  p_stay_id: string;
  p_operation_id: string;
  p_scope: StayScope;
  p_observation: Record<string, unknown>;
};
export type StayRpcArgs = {
  get_family_trip_stay_view_v1: { p_trip_id: string };
  get_family_stay_editor_v1: { p_trip_id: string; p_stay_id: string };
  get_family_stay_command_context_v1: {
    p_trip_id: string;
    p_stay_id: string;
    p_location_id: string | null;
    p_reservation_id: string | null;
  };
  save_family_stay_v1: Original & { p_changes: Record<string, unknown> };
  set_family_stay_booking_link_v1: Original & {
    p_reservation_id: string | null;
  };
  trash_family_stay_v1: Original;
  restore_family_stay_v1: Original;
  get_family_stay_history_v1: {
    p_trip_id: string;
    p_stay_id: string;
    p_before_sequence: number | null;
    p_limit: number;
  };
  get_family_stay_command_outcome_v1: Original & {
    p_action: "save" | "link" | "trash" | "restore";
    p_changes: Record<string, unknown>;
    p_reservation_id: string | null;
  };
  cancel_family_stay_command_v1: StayRpcArgs["get_family_stay_command_outcome_v1"];
};
const names: readonly (keyof StayRpcArgs)[] = [
  "get_family_trip_stay_view_v1",
  "get_family_stay_editor_v1",
  "get_family_stay_command_context_v1",
  "save_family_stay_v1",
  "set_family_stay_booking_link_v1",
  "trash_family_stay_v1",
  "restore_family_stay_v1",
  "get_family_stay_history_v1",
  "get_family_stay_command_outcome_v1",
  "cancel_family_stay_command_v1",
];
export type StayRpc = <N extends keyof StayRpcArgs>(
  name: N,
  args: StayRpcArgs[N],
) => Promise<unknown>;
export const stayRpc: StayRpc = async (name, args) => {
  if (!names.includes(name)) throw new Error("Unsupported stay RPC");
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args);
  if (error) throw error;
  return data as unknown;
};
export type StayAuthIdentity = { user_id: string; session_id: string };
/** Local lifecycle fence only; signature, current session and permissions are checked by SQL. No token is retained. */
export async function stayAuthIdentity(): Promise<StayAuthIdentity> {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (
    !session ||
    !session.expires_at ||
    session.expires_at <= Date.now() / 1000
  )
    throw new Error("Current stay session required");
  const encoded = session.access_token.split(".");
  if (encoded.length !== 3) throw new Error("Invalid stay session token");
  const payload = JSON.parse(
    atob(encoded[1].replace(/-/g, "+").replace(/_/g, "/")),
  ) as Record<string, unknown>;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    payload.sub !== session.user.id ||
    typeof payload.session_id !== "string" ||
    !uuid.test(payload.session_id) ||
    !uuid.test(session.user.id) ||
    typeof payload.exp !== "number" ||
    payload.exp <= Date.now() / 1000
  )
    throw new Error("Invalid stay session identity");
  return { user_id: session.user.id, session_id: payload.session_id };
}
