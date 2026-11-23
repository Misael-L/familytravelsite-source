import { shareLinkRequestSchema, type ShareLinkRequest } from '@trek/shared';
import { z } from 'zod';
import { shareApi, tripInviteApi } from '../api/client';
import { readConnectedTrip, writeConnectedTrip } from './onlineTrip';
const token = z
  .string()
  .min(1)
  .regex(/^[^\s/?#]+$/);
const link = z.object({ token: token.nullish() }).loose();
export type TripPublicLink = ShareLinkRequest & { token: string | null };
function publicLink(value: unknown): TripPublicLink {
  const data = link.parse(value ?? { token: null });
  return { ...data, ...shareLinkRequestSchema.parse(data), token: data.token ?? null };
}
function inviteLink(value: unknown) {
  const data = link.parse(value ?? { token: null });
  return { ...data, token: data.token ?? null };
}
export const tripLinksRepo = {
  share: {
    get: (tripId: number) => readConnectedTrip(async () => publicLink(await shareApi.getLink(tripId))),
    create: (tripId: number, permissions: ShareLinkRequest) =>
      writeConnectedTrip(async () => {
        const data = publicLink(await shareApi.createLink(tripId, shareLinkRequestSchema.parse(permissions)));
        token.parse(data.token);
        return data;
      }),
    remove: (tripId: number) => writeConnectedTrip<void>(() => shareApi.deleteLink(tripId)),
  },
  invite: {
    get: (tripId: number) => readConnectedTrip(async () => inviteLink(await tripInviteApi.getLink(tripId))),
    create: (tripId: number) =>
      writeConnectedTrip(async () => {
        const data = inviteLink(await tripInviteApi.createLink(tripId));
        token.parse(data.token);
        return data;
      }),
    remove: (tripId: number) => writeConnectedTrip<void>(() => tripInviteApi.deleteLink(tripId)),
  },
};
