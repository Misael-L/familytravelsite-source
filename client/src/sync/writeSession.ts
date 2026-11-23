import { assertWritableSession } from '../db/readOnlySession';
import { captureReadSession } from './readSession';
export class WriteSessionChanged extends Error {
  constructor() {
    super(
      'The session changed. The request may have completed in its original account. Reload that account before retrying.'
    );
    this.name = 'WriteSessionChanged';
  }
}
/** Does not cancel server commits, rewrite original requests or authorize automatic replay. */
export function captureWriteSession() {
  assertWritableSession();
  const session = captureReadSession();
  const assertCurrent = () => {
    assertWritableSession();
    if (!session.current()) throw new WriteSessionChanged();
  };
  async function perform<T>(operation: () => Promise<T> | T): Promise<T> {
    assertCurrent();
    try {
      const result = await operation();
      assertCurrent();
      return result;
    } catch (error) {
      assertCurrent();
      throw error;
    }
  }
  return { ...session, assertCurrent, perform };
}

/** Guards completion and follow-up effects in the caller's captured session and view. */
export function createSessionAction(session: { current: () => boolean }, visible: () => boolean) {
  const current = () => session.current() && visible();
  const assertCurrent = () => {
    if (!current()) throw new WriteSessionChanged();
  };
  async function perform<T>(operation: () => Promise<T> | T): Promise<T> {
    assertCurrent();
    try {
      const value = await operation();
      assertCurrent();
      return value;
    } catch (error) {
      assertCurrent();
      throw error;
    }
  }
  return {
    current,
    assertCurrent,
    perform,
    effect: (apply: () => void) => {
      if (current()) apply();
    },
  };
}
