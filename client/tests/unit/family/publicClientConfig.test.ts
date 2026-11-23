import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PUBLIC_CONFIG_ASSET,
  createPublicClientConfigReceipt,
  familyPublicClientConfig,
  publicConfigHash,
  publicEnvironmentSlots,
  scanApprovedPublicConfig,
} from '../../../publicClientConfig.mjs';
import { artifactScanFailed, scanArtifactRoot, scanText, unreviewedHits } from './secretScan';

const glue = (...parts: string[]) => parts.join('');
const origin = () => glue('https://family-core-fixture.', 'supabase', '.co');
const key = () => glue('sb_', 'publishable_', 'fixture_supported_core');
const jwt = () => glue('eyJfixturefixture', '.fixturefixture', '.fixturefixture');
const commit = 'a'.repeat(40);
const env = () => ({ VITE_DATA_PLANE: 'supabase', VITE_SUPABASE_URL: origin(), VITE_SUPABASE_ANON_KEY: key() });
const fields = (): Record<string, string | boolean> => ({
  BASE_URL: '/',
  DEV: false,
  MODE: 'production',
  PROD: true,
  SSR: false,
  ...env(),
});
const code = (values = fields(), tail = '') => 'export const env=' + JSON.stringify(values) + ';' + tail;
type FixtureChunk = { type: 'chunk'; isEntry: boolean; name: string; fileName: string; code: string };
const bundle = (source: string): Record<string, FixtureChunk> => ({
  'assets/index-test.js': {
    type: 'chunk',
    isEntry: true,
    name: 'index',
    fileName: 'assets/index-test.js',
    code: 'export{};',
  },
  'assets/env-test.js': { type: 'chunk', isEntry: false, name: 'env', fileName: 'assets/env-test.js', code: source },
});
type Receipt = NonNullable<ReturnType<typeof createPublicClientConfigReceipt>>;
function requiredFixtureReceipt(output: ReturnType<typeof bundle>): Receipt {
  const receipt = createPublicClientConfigReceipt(output, '5.1.4', commit, env());
  if (receipt === null) throw new Error('Expected a source-bound public configuration receipt for this fixture');
  return receipt;
}
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function artifact(source = code()) {
  const root = mkdtempSync(path.join(tmpdir(), 'family-public-config-'));
  roots.push(root);
  mkdirSync(path.join(root, 'assets'));
  const output = bundle(source);
  for (const chunk of Object.values(output)) writeFileSync(path.join(root, chunk.fileName), chunk.code);
  const receipt = requiredFixtureReceipt(output);
  writeFileSync(path.join(root, PUBLIC_CONFIG_ASSET), JSON.stringify(receipt));
  writeFileSync(
    path.join(root, 'family-build.json'),
    JSON.stringify({
      format: 'family.build.v1',
      version: receipt.version,
      entry: receipt.entry,
    })
  );
  return { root, receipt };
}
const scan = (root: string, sourceCommit = commit) =>
  scanArtifactRoot(root, { repo: 'FamilyTravelSite', kind: 'dist', sourceCommit });

describe('exact public build configuration', () => {
  it('classifies complete production env only, without changing finalized bytes', () => {
    const { root, receipt } = artifact(),
      before = readFileSync(path.join(root, 'assets/env-test.js'));
    expect(publicEnvironmentSlots(before.toString())).toHaveLength(1);
    const scannedReceipt = scanApprovedPublicConfig(root, commit);
    if (scannedReceipt === null) throw new Error('Expected the finalized fixture scanner to return a receipt');
    expect(scannedReceipt.pair).toEqual(receipt.pair);
    expect(artifactScanFailed(scan(root))).toBe(false);
    expect(readFileSync(path.join(root, 'assets/env-test.js'))).toEqual(before);
    expect(JSON.stringify(receipt)).not.toContain(origin());
    expect(JSON.stringify(receipt)).not.toContain(key());
  });
  it('accepts minified booleans, template literals and independently parsed copies', () => {
    const quote = String.fromCharCode(96);
    const source = code()
      .replace('"DEV":false', 'DEV:!1')
      .replace('"PROD":true', 'PROD:!0')
      .replace('"SSR":false', 'SSR:!1')
      .replace(JSON.stringify(origin()), quote + origin() + quote);
    expect(publicEnvironmentSlots(source + source.replace('const env=', 'const other='))).toHaveLength(2);
    expect(artifactScanFailed(scan(artifact(source).root))).toBe(false);
  });
  it('emits only with explicit immutable source binding; local profiles get no receipt', () => {
    expect(createPublicClientConfigReceipt(bundle(code()), '5.1.4', undefined, env())).toBeNull();
    expect(
      createPublicClientConfigReceipt(bundle(code()), '5.1.4', commit, {
        ...env(),
        VITE_SUPABASE_URL: 'http://localhost:54321',
      })
    ).toBeNull();
    const emitted: { fileName: string; source: string }[] = [],
      plugin = familyPublicClientConfig('5.1.4', commit);
    plugin.configResolved({ env: env() });
    plugin.generateBundle.handler.call(
      { emitFile: (asset: { fileName: string; source: string }) => emitted.push(asset) },
      {},
      bundle(code())
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0].fileName).toBe(PUBLIC_CONFIG_ASSET);
    expect(JSON.parse(emitted[0].source).sourceCommit).toBe(commit);
  });
  it.each([
    ['unknown host', () => ({ ...env(), VITE_SUPABASE_URL: glue('https://unreviewed.', 'supabase', '.co') })],
    ['hostname suffix', () => ({ ...env(), VITE_SUPABASE_URL: origin() + '.invalid' })],
    ['userinfo', () => ({ ...env(), VITE_SUPABASE_URL: origin().replace('https://', 'https://x@') })],
    ['query', () => ({ ...env(), VITE_SUPABASE_URL: origin() + '?x=1' })],
    ['path', () => ({ ...env(), VITE_SUPABASE_URL: origin() + '/' })],
    ['secret key', () => ({ ...env(), VITE_SUPABASE_ANON_KEY: glue('sb_', 'secret_', 'not_a_public_key_value') })],
    ['JWT key', () => ({ ...env(), VITE_SUPABASE_ANON_KEY: jwt() })],
    ['empty key', () => ({ ...env(), VITE_SUPABASE_ANON_KEY: '' })],
    ['wrong plane', () => ({ ...env(), VITE_DATA_PLANE: 'trek' })],
    ['unknown setting', () => ({ ...env(), VITE_UNKNOWN_KEY: 'value' })],
    ['writer flag', () => ({ ...env(), VITE_FAMILY_STAY_WRITE_QUALIFICATION: 'local-v1' })],
  ])('rejects %s at build time', (_name, make) => {
    expect(() => createPublicClientConfigReceipt(bundle(code()), '5.1.4', commit, make())).toThrow();
  });
  it.each(['HEAD', 'a'.repeat(39), 'A'.repeat(40), 'a'.repeat(41)])('rejects nonimmutable source %s', (source) => {
    expect(() => createPublicClientConfigReceipt(bundle(code()), '5.1.4', source, env())).toThrow();
  });
  it.each([
    [
      'missing base',
      () => {
        const f = fields();
        delete f.SSR;
        return code(f);
      },
    ],
    ['development mode', () => code({ ...fields(), MODE: 'development' })],
    ['wrong boolean', () => code().replace('"DEV":false', '"DEV":!2')],
    ['computed boolean', () => code().replace('"DEV":false', '"DEV":Boolean(0)')],
    ['spread', () => code().replace('={', '={...other,')],
    ['computed key', () => code().replace('"VITE_SUPABASE_URL":', '["VITE_SUPABASE_URL"]:')],
    ['duplicate key', () => code().replace('={', '={"MODE":"production",')],
    ['unknown key', () => code({ ...fields(), VITE_UNKNOWN_KEY: 'value' })],
    ['writer flag', () => code({ ...fields(), VITE_FAMILY_STAY_WRITE_QUALIFICATION: 'local-v1' })],
    ['escaped URL', () => code().replace('https:', '\\u0068ttps:')],
    [
      'interpolated URL',
      () =>
        code().replace(
          JSON.stringify(origin()),
          String.fromCharCode(96) + 'https://$' + '{host}' + String.fromCharCode(96)
        ),
    ],
    ['syntax error', () => code() + '{'],
  ])('refuses %s inside generated env', (_name, make) => {
    expect(() => publicEnvironmentSlots(make())).toThrow();
  });
  it('does not approve comments, free URL literals or partial objects', () => {
    expect(publicEnvironmentSlots('// VITE_SUPABASE_URL\nconst x=' + JSON.stringify(origin()) + ';')).toEqual([]);
    expect(() => publicEnvironmentSlots('const x={VITE_SUPABASE_URL:' + JSON.stringify(origin()) + '};')).toThrow();
  });
});

describe('independent artifact verification', () => {
  const mutations: [string, (r: Receipt) => void][] = [
    [
      'wrong source',
      (r) => {
        r.sourceCommit = 'b'.repeat(40);
      },
    ],
    [
      'wrong format',
      (r) => {
        r.format = 'anything';
      },
    ],
    [
      'wrong policy',
      (r) => {
        r.pair.policy = 'unreviewed';
      },
    ],
    [
      'wrong origin hash',
      (r) => {
        r.pair.originSha256 = '0'.repeat(64);
      },
    ],
    [
      'wrong key hash',
      (r) => {
        r.pair.keySha256 = '0'.repeat(64);
      },
    ],
    [
      'wrong version',
      (r) => {
        r.version = '5.1.5';
      },
    ],
    [
      'wrong entry',
      (r) => {
        r.entry.sha256 = '0'.repeat(64);
      },
    ],
    [
      'no chunks',
      (r) => {
        r.chunks = [];
      },
    ],
    [
      'duplicate chunk',
      (r) => {
        r.chunks.push(r.chunks[0]);
      },
    ],
    [
      'path traversal',
      (r) => {
        r.chunks[0].path = '../outside.js';
      },
    ],
    [
      'wrong bytes',
      (r) => {
        r.chunks[0].bytes++;
      },
    ],
    [
      'wrong hash',
      (r) => {
        r.chunks[0].sha256 = '0'.repeat(64);
      },
    ],
    [
      'wrong slot',
      (r) => {
        r.chunks[0].slots[0].start--;
      },
    ],
    [
      'no slots',
      (r) => {
        r.chunks[0].slots = [];
      },
    ],
    [
      'too many chunks',
      (r) => {
        r.chunks = Array(33).fill(r.chunks[0]);
      },
    ],
  ];
  it.each(mutations)('refuses receipt tampering: %s', (_name, change) => {
    const { root, receipt } = artifact();
    change(receipt);
    writeFileSync(path.join(root, PUBLIC_CONFIG_ASSET), JSON.stringify(receipt));
    const result = scan(root);
    expect(artifactScanFailed(result)).toBe(true);
    expect(result.readErrors).toContainEqual({ path: PUBLIC_CONFIG_ASSET, code: 'public_config_refused' });
  });
  it.each(['assets/env-test.js', 'assets/index-test.js', 'family-build.json'])('refuses changed bytes: %s', (name) => {
    const { root } = artifact();
    writeFileSync(
      path.join(root, name),
      name === 'family-build.json' ? '{"format":"changed"}' : readFileSync(path.join(root, name), 'utf8') + ' '
    );
    expect(artifactScanFailed(scan(root))).toBe(true);
  });
  it('requires the external expected commit; receipt cannot approve itself', () => {
    const { root } = artifact();
    expect(artifactScanFailed(scanArtifactRoot(root, { repo: 'FamilyTravelSite', kind: 'dist' }))).toBe(true);
    expect(artifactScanFailed(scan(root, 'b'.repeat(40)))).toBe(true);
    expect(artifactScanFailed(scan(root, 'HEAD'))).toBe(true);
  });
  it.each([
    ['FamilyTravelApp', 'dist'],
    ['FamilyTravelSite', 'archive'],
    ['FamilyTravelApp', 'archive'],
  ] as const)('refuses other repo/source-archive context: %s %s', (repo, kind) => {
    expect(artifactScanFailed(scanArtifactRoot(artifact().root, { repo, kind, sourceCommit: commit }))).toBe(true);
  });
  it('keeps old host refusal without receipt', () => {
    const { root } = artifact();
    rmSync(path.join(root, PUBLIC_CONFIG_ASSET));
    expect(scanApprovedPublicConfig(root, commit)).toBeNull();
    expect(scan(root).hits.some((f) => f.kind === 'SUPABASE_CO')).toBe(true);
  });
  it.each([
    ['same origin elsewhere', () => 'globalThis.leak=' + JSON.stringify(origin()) + ';', 'SUPABASE_CO'],
    [
      'unknown origin elsewhere',
      () => 'globalThis.leak=' + JSON.stringify(glue('https://other.', 'supabase', '.co')) + ';',
      'SUPABASE_CO',
    ],
    [
      'secret elsewhere',
      () => 'globalThis.leak=' + JSON.stringify(glue('sb_', 'secret_', 'negative_value_123456')) + ';',
      'SUPABASE_SECRET_KEY',
    ],
    ['JWT elsewhere', () => 'globalThis.leak=' + JSON.stringify(jwt()) + ';', 'JWT_LIKE'],
    ['service key elsewhere', () => 'service_role_key="negative_value_123456";', 'SERVICE_ROLE'],
  ])('keeps %s rejected on same generated line', (_name, tail, kind) => {
    const { root } = artifact(code(fields(), tail()));
    expect(scanApprovedPublicConfig(root, commit)).not.toBeNull();
    expect(scan(root).hits.some((f) => f.kind.includes(kind))).toBe(true);
  });
  it('rejects unbound extra chunk even when receipt chunks validate', () => {
    const { root } = artifact();
    writeFileSync(path.join(root, 'assets/extra-test.js'), 'export default ' + JSON.stringify(origin()));
    expect(artifactScanFailed(scan(root))).toBe(true);
  });
  it.each([PUBLIC_CONFIG_ASSET, 'family-build.json', 'assets/env-test.js', 'assets'])('rejects symlink %s', (name) => {
    const { root } = artifact(),
      target = path.join(root, name),
      saved = path.join(root, 'saved');
    if (name === 'assets') {
      mkdirSync(saved);
      for (const n of ['env-test.js', 'index-test.js'])
        writeFileSync(path.join(saved, n), readFileSync(path.join(target, n)));
    } else writeFileSync(saved, readFileSync(target));
    rmSync(target, { recursive: true, force: true });
    symlinkSync(saved, target);
    expect(artifactScanFailed(scan(root))).toBe(true);
  });
  it('rejects malformed/oversized receipt and unknown properties', () => {
    const { root, receipt } = artifact();
    for (const body of ['{', JSON.stringify({ ...receipt, approved: true }), ' '.repeat(128 * 1024 + 1)]) {
      writeFileSync(path.join(root, PUBLIC_CONFIG_ASSET), body);
      expect(artifactScanFailed(scan(root))).toBe(true);
    }
  });
  it('detects secret prefix outside artifact mode', () => {
    expect(
      unreviewedHits(scanText('const key="' + glue('sb_', 'secret_', 'negative_value_123456') + '";', 'source.ts'))
    ).toEqual([expect.objectContaining({ kind: 'SUPABASE_SECRET_KEY' })]);
    expect(publicConfigHash('unchanged')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('reviewed compiler-folded public origin contexts', () => {
  const account =
    'function Ve(e,t,n){return e===`supabase`&&t===`local-v1`&&[`http://127.0.0.1:55331`,`http://localhost:55331`].includes(n)};var He=()=>Ve(`supabase`,``,`<reviewed-public-origin>`);';
  it('accepts only the exact reviewed account expression and asset context', () => {
    const source = account.replace('<reviewed-public-origin>', origin());
    const pair = requiredFixtureReceipt(bundle(code())).pair;
    expect(publicEnvironmentSlots(source, 'assets/AccountDemoLock-test.js', pair)).toHaveLength(1);
    expect(publicEnvironmentSlots(source, 'assets/other-test.js', pair)).toEqual([]);
    expect(
      publicEnvironmentSlots(source.replace('supabase', 'changed'), 'assets/AccountDemoLock-test.js', pair)
    ).toEqual([]);
    const output = bundle(code());
    output['assets/AccountDemoLock-test.js'] = {
      type: 'chunk',
      isEntry: false,
      name: 'folded',
      fileName: 'assets/AccountDemoLock-test.js',
      code: source,
    };
    const receipt = requiredFixtureReceipt(output);
    expect(receipt.chunks).toHaveLength(2);
  });
  it('accepts the complete alpha-equivalent cancellation-foundation compiler form only', () => {
    const alias = account.replace('function Ve(', 'function He(').replace('var He=()=>Ve(', 'var Ue=()=>He(');
    const source = alias.replace('<reviewed-public-origin>', origin());
    const pair = requiredFixtureReceipt(bundle(code())).pair;
    expect(publicEnvironmentSlots(source, 'assets/AccountDemoLock-test.js', pair)).toHaveLength(1);
    for (const changed of [
      source.replace('`local-v1`', '`enabled`'),
      source.replace('55331', '55332'),
      source.replace('(`supabase`,``', '(`supabase`,void 0'),
      source.split('He').join('arbitrary'),
    ])
      expect(publicEnvironmentSlots(changed, 'assets/AccountDemoLock-test.js', pair)).toEqual([]);
    expect(publicEnvironmentSlots(source, 'assets/other-test.js', pair)).toEqual([]);
  });
  const settings =
    'function v(e){let n=t();if(n.name===`trek-offline`)return null;let r=[`supabase`,`<reviewed-public-origin>`,n.name];return _+encodeURIComponent(JSON.stringify(r))+`:`+e}';
  it('pins the complete reviewed settings compiler alias variant and rejects nearby changes', () => {
    const alias =
      'function v(e){let t=n();if(t.name===`trek-offline`)return null;let r=[`supabase`,`<reviewed-public-origin>`,t.name];return _+encodeURIComponent(JSON.stringify(r))+`:`+e}';
    const source = alias.replace('<reviewed-public-origin>', origin());
    const pair = requiredFixtureReceipt(bundle(code())).pair;
    expect(publicEnvironmentSlots(source, 'assets/settingsStore-test.js', pair)).toHaveLength(1);
    for (const changed of [
      source.replace('t.name]', 'e.name]'),
      source.replace('return _+', 'return other+'),
      source.replace('`supabase`', '`changed`'),
    ]) {
      expect(publicEnvironmentSlots(changed, 'assets/settingsStore-test.js', pair)).toEqual([]);
    }
    expect(publicEnvironmentSlots(source, 'assets/other-test.js', pair)).toEqual([]);
  });
  it('accepts only the exact reviewed settings expression and asset context', () => {
    const source = settings.replace('<reviewed-public-origin>', origin());
    const pair = requiredFixtureReceipt(bundle(code())).pair;
    expect(publicEnvironmentSlots(source, 'assets/settingsStore-test.js', pair)).toHaveLength(1);
    expect(publicEnvironmentSlots(source, 'assets/other-test.js', pair)).toEqual([]);
    expect(publicEnvironmentSlots(source.replace('supabase', 'changed'), 'assets/settingsStore-test.js', pair)).toEqual(
      []
    );
    const output = bundle(code());
    output['assets/settingsStore-test.js'] = {
      type: 'chunk',
      isEntry: false,
      name: 'folded',
      fileName: 'assets/settingsStore-test.js',
      code: source,
    };
    const receipt = requiredFixtureReceipt(output);
    expect(receipt.chunks).toHaveLength(2);
  });
});
