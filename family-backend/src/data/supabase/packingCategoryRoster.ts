import { getSupabaseBrowserClient } from "./client";

export type PackingCategoryPerson = {
  personId: string;
  displayName: string;
  isGuest: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function rows(result: { data: unknown; count: number | null; error: unknown }) {
  if (result.error) throw result.error;
  if (
    !Array.isArray(result.data) ||
    result.count !== result.data.length ||
    result.count > 2000
  )
    throw new Error("Incomplete packing responsibility roster");
  return result.data as Record<string, unknown>[];
}
/** Authorized Trip roster, excluding archived People and inactive linked accounts; referenced history is separate. */
export async function listPackingCategoryPeople(
  trip: string,
  family: string,
): Promise<PackingCategoryPerson[]> {
  if (!uuid.test(trip) || !uuid.test(family))
    throw new Error("Invalid packing roster scope");
  const sdk = getSupabaseBrowserClient();
  const [travelers, members] = await Promise.all([
    sdk
      .from("trip_travelers")
      .select(
        "person_id,people(id,family_id,display_name,user_id,archived_at)",
        { count: "exact" },
      )
      .eq("trip_id", trip)
      .limit(2001),
    sdk
      .from("family_members")
      .select("user_id", { count: "exact" })
      .eq("family_id", family)
      .eq("status", "active")
      .limit(2001),
  ]);
  const active = new Set(
    rows(members).map((r) => {
      if (typeof r.user_id !== "string" || !uuid.test(r.user_id))
        throw new Error("Invalid active account");
      return r.user_id;
    }),
  );
  const people = new Map<string, PackingCategoryPerson>();
  for (const r of rows(travelers)) {
    const p = (Array.isArray(r.people) ? r.people[0] : r.people) as Record<
      string,
      unknown
    > | null;
    if (!p) continue; // RLS-hidden/missing directory row never becomes a selectable Person.
    if (
      typeof p.id !== "string" ||
      !uuid.test(p.id) ||
      p.id !== r.person_id ||
      p.family_id !== family ||
      typeof p.display_name !== "string" ||
      !(
        p.user_id === null ||
        (typeof p.user_id === "string" && uuid.test(p.user_id))
      )
    )
      throw new Error("Invalid packing roster Person");
    if (
      p.archived_at !== null ||
      (p.user_id !== null && !active.has(p.user_id as string))
    )
      continue;
    people.set(p.id, {
      personId: p.id,
      displayName: p.display_name,
      isGuest: p.user_id === null,
    });
  }
  return [...people.values()].sort((a, b) =>
    a.personId.localeCompare(b.personId),
  );
}
