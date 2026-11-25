import policy from '../../../corePrimaryProfiles.json';
import { coreHttpsWriterProfileEnabled, writerOriginHash } from './coreHttpsWriterProfile';

export type PrimaryCoreMode = 'write' | 'read' | 'blocked' | undefined;

export function isPrimaryMexicoPreviewBuild(env: Record<string, unknown> = import.meta.env): boolean {
  return env[policy.field] === policy.mexicoPreview;
}

export function primaryCoreMode(
  env: Record<string, unknown> = import.meta.env,
  siteOrigin = globalThis.location?.origin
): PrimaryCoreMode {
  const value = env[policy.field];
  if (value !== policy.production && value !== policy.preview && value !== policy.fallback && value !== policy.mexicoPreview)
    return;
  if (!siteOrigin || !coreHttpsWriterProfileEnabled({ ...policy, value }, env)) return 'blocked';

  const site = writerOriginHash(siteOrigin);
  if (value === policy.mexicoPreview) return site === policy.previewSiteSha256 ? 'read' : 'blocked';
  if (value === policy.fallback)
    return site === policy.productionSiteSha256 || site === policy.previewSiteSha256 ? 'read' : 'blocked';
  const expectedSite = value === policy.production ? policy.productionSiteSha256 : policy.previewSiteSha256;
  return site === expectedSite ? 'write' : 'blocked';
}
