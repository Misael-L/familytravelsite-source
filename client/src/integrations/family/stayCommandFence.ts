import type { StayAuthIdentity } from '@family/backend/supabase/stayRpc';
import type { FamilyApiError } from './errors';
import type { FamilyFrontendRepository } from './repository';
import { stayScope } from './stayContract';

/** Recovery may inspect an original intent after sign-in. Submitting it requires the original sign-in. */
export function createStayCommandFence(
  original: ReturnType<typeof stayScope.parse>,
  repo: Pick<FamilyFrontendRepository, 'session'>,
  auth: () => Promise<StayAuthIdentity>,
  check: () => void,
  changed: () => FamilyApiError
) {
  let sessionId: string | null = null;
  return async (write = false) => {
    check();
    const identity = await auth();
    check();
    const session = await repo.session();
    check();
    if (
      identity.user_id !== original.user_id ||
      session.userId !== original.user_id ||
      session.familyId !== original.family_id ||
      session.personId !== original.person_id ||
      (sessionId !== null && identity.session_id !== sessionId) ||
      (write && identity.session_id !== original.session_id)
    )
      throw changed();
    sessionId = identity.session_id;
    return stayScope.parse({ ...original, session_id: sessionId });
  };
}
