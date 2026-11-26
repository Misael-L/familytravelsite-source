import { beforeEach, expect, it, vi } from "vitest";
import { listPackingCategoryPeople } from "./packingCategoryRoster";
const from = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ getSupabaseBrowserClient: () => ({ from }) }));
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let people: unknown[],
  active: unknown[],
  error: unknown,
  count: number | undefined;
beforeEach(() => {
  people = [];
  active = [];
  error = null;
  count = undefined;
  from.mockReset().mockImplementation((table) => {
    const data = table === "trip_travelers" ? people : active;
    const query = { select: vi.fn(), eq: vi.fn(), limit: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.limit.mockResolvedValue({ data, error, count: count ?? data.length });
    return query;
  });
});
const person = (
  n: number,
  user: string | null,
  archived: string | null = null,
) => ({
  person_id: id(n),
  people: {
    id: id(n),
    family_id: id(2),
    display_name: "Person " + n,
    user_id: user,
    archived_at: archived,
  },
});
it("includes eligible Auth-less guests and active linked travelers using Person identities", async () => {
  people = [person(3, null), person(4, id(40))];
  active = [{ user_id: id(40) }];
  await expect(listPackingCategoryPeople(id(1), id(2))).resolves.toEqual([
    { personId: id(3), displayName: "Person 3", isGuest: true },
    { personId: id(4), displayName: "Person 4", isGuest: false },
  ]);
  expect(from).toHaveBeenCalledWith("trip_travelers");
  expect(from).toHaveBeenCalledWith("family_members");
});
it("excludes inactive accounts, archived People and RLS-hidden directory embeds", async () => {
  people = [
    person(3, id(30)),
    person(4, null, "2026-11-11"),
    { person_id: id(5), people: null },
  ];
  await expect(listPackingCategoryPeople(id(1), id(2))).resolves.toEqual([]);
});
it("refuses a response from another Family", async () => {
  const p = person(3, null);
  p.people.family_id = id(99);
  people = [p];
  await expect(listPackingCategoryPeople(id(1), id(2))).rejects.toThrow(
    "Invalid packing roster Person",
  );
});
it("refuses truncated counts instead of presenting an incomplete eligible roster", async () => {
  people = [person(3, null)];
  count = 10;
  await expect(listPackingCategoryPeople(id(1), id(2))).rejects.toThrow(
    "Incomplete",
  );
});
it("propagates authorization errors without inventing an empty successful roster", async () => {
  error = { code: "42501" };
  await expect(listPackingCategoryPeople(id(1), id(2))).rejects.toEqual(error);
});
it("rejects invalid Trip/Family identifiers before a query", async () => {
  await expect(listPackingCategoryPeople("other", id(2))).rejects.toThrow(
    "Invalid",
  );
  expect(from).not.toHaveBeenCalled();
});
