import type { AiStatusResponse } from '@trek/shared';
import { aiConnectionsRepo } from '../repo/aiConnectionsRepo';
import { OnlineOnlyError } from '../repo/onlineOnly';
import type { AssistantContext } from './assistantStore';

type Acks = { privacyAcked: number; studioImagesAcked: number };
const connection = (status: AiStatusResponse | null) => JSON.stringify(status?.effective);
/** A same-connection GET cannot undo an acknowledgement completed while it was pending. */
function preserveAcks(reply: AiStatusResponse, current: AiStatusResponse | null, before: Acks, after: Acks) {
  if (!current || connection(current) !== connection(reply)) return reply;
  return {
    ...reply,
    ...(before.privacyAcked !== after.privacyAcked ? { privacyAcked: current.privacyAcked } : {}),
    ...(before.studioImagesAcked !== after.studioImagesAcked ? { studioImagesAcked: current.studioImagesAcked } : {}),
  };
}
/** Status requests obey native policy gates; acknowledgements belong to the exact effective connection. */
export function assistantStatusActions(ctx: AssistantContext, open: () => boolean) {
  const acks: Acks = { privacyAcked: 0, studioImagesAcked: 0 };
  const ack = async (scope?: 'studio_images') => {
    const effective = ctx.get().status?.effective;
    if (!effective) return;
    const owner = ctx.ownership.captureOwner(),
      original = connection(ctx.get().status);
    await aiConnectionsRepo.ackPrivacy({ kind: effective.kind, host: effective.host, ...(scope ? { scope } : {}) });
    if (!owner.current()) return;
    const status = ctx.get().status;
    if (!status || connection(status) !== original) return;
    const flag = scope ? 'studioImagesAcked' : 'privacyAcked';
    acks[flag]++;
    ctx.set({ status: { ...status, [flag]: true } });
  };
  return {
    loadStatus: async () => {
      const owner = ctx.ownership.readStatus(),
        before = { ...acks };
      if (!open()) {
        ctx.set({ status: null });
        return;
      }
      try {
        const status = await aiConnectionsRepo.status();
        if (owner.current() && open()) ctx.set({ status: preserveAcks(status, ctx.get().status, before, acks) });
      } catch (error) {
        if (owner.current() && !(error instanceof OnlineOnlyError)) ctx.set({ status: null });
      }
    },
    ackPrivacy: () => ack(),
    ackStudioImages: () => ack('studio_images'),
  };
}
