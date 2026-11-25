import { z } from 'zod';
import { bookingStayView, checkedNativeStayCore } from './bookingStayContract';
import { stayJson, type StayIdentity } from './stayContract';
import { parseStay } from './stayTransport';
export const nativeStayView = z
  .object({ format: z.literal('family.native-stay-view.v1'), core: bookingStayView })
  .strict();
export type NativeStayView = z.infer<typeof nativeStayView>;
export function checkedNativeStayView(raw: unknown, expected: StayIdentity): NativeStayView {
  const p = parseStay(nativeStayView, raw, 8392704);
  if (stayJson(p) !== stayJson(raw)) throw new Error('Lossy native stay view');
  checkedNativeStayCore(p.core, expected);
  return p;
}
