import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPublicClientConfigReceipt,
  publicConfigHash,
  scanApprovedPublicConfig,
} from '../../../publicClientConfig.mjs';
const source = ['https://family-core-fixture.', 'supabase', '.co'].join(''),
  key = ['sb_', 'publishable_', 'fixture_supported_core'].join(''),
  commit = 'a'.repeat(40);
const env = (profile: string) => ({
  VITE_DATA_PLANE: 'supabase',
  VITE_SUPABASE_URL: source,
  VITE_SUPABASE_ANON_KEY: key,
  VITE_FAMILY_CORE_WRITER_PROFILE: profile,
});
const roots: string[] = [];
afterEach(() => {
  for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
});
function bundle(profile: string) {
  return {
    'assets/index-test.js': {
      type: 'chunk',
      isEntry: true,
      name: 'index',
      fileName: 'assets/index-test.js',
      code:
        'export const env=' +
        JSON.stringify({
          BASE_URL: '/',
          DEV: false,
          MODE: 'production',
          PROD: true,
          SSR: false,
          ...env(profile),
          VITE_FAMILY_CORE_WRITER_PROFILE: profile,
        }) +
        ';',
    },
  };
}
function artifact(profile: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'core-task-config-'));
  roots.push(root);
  mkdirSync(root + '/assets');
  const output = bundle(profile),
    receipt = createPublicClientConfigReceipt(output, '5.1.4', commit, env(profile));
  if (!receipt) throw Error('Expected bound config receipt');
  writeFileSync(root + '/assets/index-test.js', output['assets/index-test.js'].code);
  writeFileSync(root + '/family-public-config.json', JSON.stringify(receipt));
  writeFileSync(
    root + '/family-build.json',
    JSON.stringify({ format: 'family.build.v1', version: '5.1.4', entry: receipt.entry })
  );
  return { root, receipt };
}
describe.each(['isolated-planner-packing-v1', 'isolated-task-planner-packing-v1'])(
  'explicit %s in finalized configuration',
  (profile) => {
    it('independently binds the finite profile in env and receipt', () => {
      const { root, receipt } = artifact(profile);
      expect(receipt.writerProfile).toBe(profile);
      expect(scanApprovedPublicConfig(root, commit)).toMatchObject({ sourceCommit: commit });
      expect(JSON.stringify(receipt)).not.toContain(source);
      expect(JSON.stringify(receipt)).not.toContain(key);
    });
    it.each(['local-v1', 'isolated-task-v2', 'isolated-task-v1,isolated-planner-packing-v1', 'primary', 'true'])(
      'refuses unknown profile %s',
      (value) => {
        expect(() =>
          createPublicClientConfigReceipt(bundle(value), '5.1.4', commit, {
            ...env(profile),
            VITE_FAMILY_CORE_WRITER_PROFILE: value,
          })
        ).toThrow();
      }
    );
    it('refuses profile disagreement between build env and finalized bytes', () => {
      expect(() => createPublicClientConfigReceipt(bundle(''), '5.1.4', commit, env(profile))).toThrow();
      expect(() =>
        createPublicClientConfigReceipt(bundle(profile), '5.1.4', commit, {
          ...env(profile),
          VITE_FAMILY_CORE_WRITER_PROFILE: '',
        })
      ).toThrow();
    });
    it.each(['remove', 'unknown', 'primary-pair', 'wrong-commit', 'missing-commit'])(
      'refuses receipt tampering: %s',
      (kind) => {
        const { root, receipt } = artifact(profile);
        if (kind === 'remove') delete receipt.writerProfile;
        else if (kind === 'unknown') receipt.writerProfile = 'unknown';
        else if (kind === 'primary-pair')
          receipt.pair = {
            ...receipt.pair,
            policy: 'family-primary',
            originSha256: '49541fb74cbba4a2bfa2313e79c3163d8f68682a46f458b554633c3ac7d3f40d',
          };
        writeFileSync(root + '/family-public-config.json', JSON.stringify(receipt));
        expect(() =>
          scanApprovedPublicConfig(
            root,
            kind === 'wrong-commit' ? 'b'.repeat(40) : kind === 'missing-commit' ? undefined : commit
          )
        ).toThrow();
      }
    );
    it('profile data uses the existing exact fixture source identity', () => {
      expect(publicConfigHash(source)).toBe('0b2c84084990656dbdcc2bb2254f68421b75a4d3f6369b2e192ed56692c4b1e6');
    });
  }
);
