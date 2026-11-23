import type { AccommodationCreateRequest, AccommodationUpdateRequest } from '@trek/shared';
import type { nativeStayTrash } from '../integrations/family/nativeStayContract';
import type { Accommodation } from '../types';
export type PlannerStayWritePort = {
  trash?: (trip: number | string, id: number, keepStop: boolean, observed?: Accommodation) => Promise<object>;
  trashPage?: (trip: number | string, cursor?: unknown) => Promise<ReturnType<typeof nativeStayTrash.parse>>;
  restore?: (trip: number | string, row: ReturnType<typeof nativeStayTrash.parse>['items'][number]) => Promise<void>;
  captureCreation?: (trip: number | string) => Accommodation[] | undefined;
  eligibleLodging?: (placeId: number) => boolean;
  create?: (
    trip: number | string,
    body: AccommodationCreateRequest,
    observed?: Accommodation[]
  ) => Promise<{ accommodation: Accommodation }>;
  update: (
    trip: number | string,
    id: number,
    body: AccommodationUpdateRequest,
    observed?: Accommodation
  ) => Promise<{ accommodation: Accommodation }>;
};
let port: PlannerStayWritePort | null = null;
export const currentPlannerStayWritePort = () => port;
export function installPlannerStayWritePort(next: PlannerStayWritePort) {
  if (port) throw new Error('A stay writer is already installed.');
  port = next;
  return () => {
    if (port === next) port = null;
  };
}
