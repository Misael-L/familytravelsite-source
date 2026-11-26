import policy from '../../../coreWriterProfile.json';
import { coreHttpsWriterProfileEnabled } from './coreHttpsWriterProfile';

export function coreHttpsTaskProfileEnabled(env: Record<string, unknown> = import.meta.env): boolean {
  return coreHttpsWriterProfileEnabled(policy, env);
}
