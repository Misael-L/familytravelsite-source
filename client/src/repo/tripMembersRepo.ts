import { tripMemberSchema, type TripMember } from '@trek/shared';
import { z } from 'zod';
import { authApi, tripsApi } from '../api/client';
import { readConnectedTrip, writeConnectedTrip } from './onlineTrip';
import { currentPlannerReadPort } from './plannerReadPort';
import { sessionRead } from './sessionRead';

// Preserve Family color and other server metadata; no traveler is promoted to owner.
const member = tripMemberSchema.extend({ id: z.number().int().positive() }).loose();
const roster = z.object({ owner: member.nullish(), members: z.array(member) }).loose();
const directory = z.object({ users: z.array(member) });
export interface TripRoster {
  owner?: TripMember;
  members: TripMember[];
}
async function readRoster(tripId: number): Promise<TripRoster> {
  const planner = currentPlannerReadPort();
  const data = roster.parse(planner?.members ? await planner.members(tripId) : await tripsApi.getMembers(tripId));
  return { ...data, owner: data.owner ?? undefined };
}
function travelers(data: TripRoster): TripMember[] {
  const unique = new Map<number, TripMember>();
  for (const row of [...(data.owner ? [data.owner] : []), ...data.members])
    if (!unique.has(row.id)) unique.set(row.id, row);
  return [...unique.values()];
}
/** The canonical trip bundle remains the cache writer. Dialog reads do not overwrite it. */
export const tripMembersRepo = {
  roster: (tripId: number) => readConnectedTrip(() => readRoster(tripId)),
  list: (tripId: number): Promise<TripMember[]> =>
    sessionRead(
      async () => travelers(await readRoster(tripId)),
      async (session) =>
        currentPlannerReadPort()?.members
          ? travelers(await readRoster(tripId))
          : z.array(member).parse(await session.db.tripMembers.where('tripId').equals(tripId).toArray())
    ),
  directory: () => readConnectedTrip(async () => directory.parse(await authApi.listUsers())),
  add: (tripId: number, identifier: string) => writeConnectedTrip<void>(() => tripsApi.addMember(tripId, identifier)),
  remove: (tripId: number, userId: number) => writeConnectedTrip<void>(() => tripsApi.removeMember(tripId, userId)),
  transfer: (tripId: number, userId: number) =>
    writeConnectedTrip<void>(() => tripsApi.transferOwnership(tripId, userId)),
  createGuest: (tripId: number, name: string) => writeConnectedTrip<void>(() => tripsApi.createGuest(tripId, name)),
  renameGuest: (tripId: number, userId: number, name: string) =>
    writeConnectedTrip<void>(() => tripsApi.renameGuest(tripId, userId, name)),
  deleteGuest: (tripId: number, userId: number) => writeConnectedTrip<void>(() => tripsApi.deleteGuest(tripId, userId)),
};
