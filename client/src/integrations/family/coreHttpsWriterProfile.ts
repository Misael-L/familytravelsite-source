import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

type WriterProfilePolicy = { field: string; value: string; originSha256: string };

export const writerOriginHash = (origin: string) => bytesToHex(sha256(new TextEncoder().encode(origin)));

/** Check the exact configured Supabase origin for a supported client profile. */
export function coreHttpsWriterProfileEnabled(policy: WriterProfilePolicy, env: Record<string, unknown>): boolean {
  const source = env.VITE_SUPABASE_URL;
  return (
    env[policy.field] === policy.value &&
    env.VITE_DATA_PLANE === 'supabase' &&
    typeof source === 'string' &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(source) &&
    writerOriginHash(source) === policy.originSha256 &&
    Object.entries(env).every(([name, value]) => !/^VITE_FAMILY_.*_QUALIFICATION$/.test(name) || !value)
  );
}
