import { z } from 'zod';
import { tripsApi } from '../api/client';
import { mutationQueue } from '../sync/mutationQueue';
import { requireOnline } from './onlineOnly';
import { readConnectedTrip, writeConnectedTrip } from './onlineTrip';
const saved = z.object({ cover_image: z.string().min(1) });
const photo = z
  .object({
    id: z.string(),
    url: z.string(),
    thumb: z.string(),
    description: z.string().nullish(),
    photographer: z.string().nullish(),
    link: z.string().nullish(),
  })
  .loose();
const photos = z.object({
  photos: z
    .array(photo)
    .nullish()
    .transform((value) => value ?? []),
});
export class TripCoverPendingError extends Error {
  constructor() {
    super('Wait for pending trip changes before replacing its cover.');
    this.name = 'TripCoverPendingError';
  }
}
async function change<T>(tripId: number, operation: () => Promise<T>): Promise<T> {
  return writeConnectedTrip(async (session) => {
    if (await session.perform(() => mutationQueue.mustQueue('trips', tripId))) throw new TripCoverPendingError();
    requireOnline();
    return session.perform(operation);
  });
}
export const tripCoverRepo = {
  upload: (tripId: number, file: File): Promise<string> =>
    change(tripId, async () => {
      const body = new FormData();
      body.append('cover', file);
      return saved.parse(await tripsApi.uploadCover(tripId, body)).cover_image;
    }),
  update: (tripId: number, url: string | null): Promise<string | null> =>
    change(tripId, async () => {
      await tripsApi.update(tripId, { cover_image: url });
      return url;
    }),
  search: (query: string) => readConnectedTrip(async () => photos.parse(await tripsApi.searchCoverImages(query))),
};
