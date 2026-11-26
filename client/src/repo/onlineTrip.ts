import { captureWriteSession } from '../sync/writeSession';
import { OnlineOnlyError, requireOnline } from './onlineOnly';
import { sessionRead } from './sessionRead';

/** Online-only Trip operations never silently enqueue or borrow a later session. */
export function readConnectedTrip<T>(operation: () => Promise<T>): Promise<T> {
  return sessionRead(
    async () => {
      requireOnline();
      return operation();
    },
    async () => {
      throw new OnlineOnlyError();
    }
  );
}
export async function writeConnectedTrip<T>(
  operation: (session: ReturnType<typeof captureWriteSession>) => Promise<T>
): Promise<T> {
  const session = captureWriteSession();
  requireOnline();
  return session.perform(() => operation(session));
}
