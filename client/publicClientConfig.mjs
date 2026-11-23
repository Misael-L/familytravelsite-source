import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import ts from 'typescript';
import plannerPolicy from './corePlannerPackingProfile.json' with { type: 'json' };
import primaryPolicy from './corePrimaryProfiles.json' with { type: 'json' };
import combinedPolicy from './coreTaskPlannerPackingProfile.json' with { type: 'json' };
import writerPolicy from './coreWriterProfile.json' with { type: 'json' };

export const PUBLIC_CONFIG_ASSET = 'family-public-config.json';
const FORMAT = 'family.public-config.v1';
// Exact reviewed origins, not a suffix allow-list. No key or project URL is stored here.
const ORIGINS = Object.freeze({
  '49541fb74cbba4a2bfa2313e79c3163d8f68682a46f458b554633c3ac7d3f40d': 'family-primary',
  '0b2c84084990656dbdcc2bb2254f68421b75a4d3f6369b2e192ed56692c4b1e6': 'isolated-core-fixture',
});
const BASE = ['BASE_URL', 'DEV', 'MODE', 'PROD', 'SSR'];
const CLIENT = ['VITE_DATA_PLANE', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_MAPBOX_ACCESS_TOKEN'];
const QUALIFICATIONS = [
  'OFFLINE_READ',
  'PACKING_AGGREGATE',
  'PACKING_BAG',
  'PACKING_IDENTITY',
  'PACKING_RECOVERY',
  'PRIVATE_FILE',
  'STAY_COMMAND',
  'STAY_CONTROLS',
  'STAY_READ',
  'STAY_WRITE',
].map((name) => 'VITE_FAMILY_' + name + '_QUALIFICATION');
const ENV_KEYS = new Set([...BASE, ...CLIENT, ...QUALIFICATIONS, writerPolicy.field]);
const CHUNK_PATH = /^assets\/[A-Za-z0-9_-]+\.js$/;
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const MAX_CHUNK = 8 * 1024 * 1024;
const refuse = () => {
  throw Error('public_client_configuration_refused');
};
export const publicConfigHash = (value) => createHash('sha256').update(value).digest('hex');

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',')
  );
}

function approvedPair(origin, key) {
  if (typeof origin !== 'string' || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin)) refuse();
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash)
    refuse();
  const originSha256 = publicConfigHash(origin),
    policy = ORIGINS[originSha256];
  if (!policy || typeof key !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{12,200}$/.test(key)) refuse();
  return { policy, originSha256, keySha256: publicConfigHash(key) };
}

function approvedWriterProfile(value, pair) {
  if (value === undefined || value === '') return '';
  if ([primaryPolicy.production, primaryPolicy.preview, primaryPolicy.fallback].includes(value)) {
    if (pair.policy !== 'family-primary' || pair.originSha256 !== primaryPolicy.originSha256) refuse();
    return value;
  }
  if (
    ![writerPolicy, plannerPolicy, combinedPolicy].some(
      (policy) =>
        policy.field === writerPolicy.field && policy.value === value && policy.originSha256 === pair.originSha256
    ) ||
    pair.policy !== 'isolated-core-fixture'
  )
    refuse();
  return value;
}

function literal(node, source) {
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  // Vite's minifier spells true/false as !0/!1. Accept only those two constants.
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.ExclamationToken &&
    ts.isNumericLiteral(node.operand) &&
    /^(0|1)$/.test(node.operand.getText(source))
  ) {
    return node.operand.text === '0';
  }
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) refuse();
  if (source.text.slice(node.getStart(source) + 1, node.end - 1) !== node.text) refuse();
  return node.text;
}

// These two already-reviewed compiler-folded configuration uses are not env objects.
// Pin the complete containing expression/function, not an arbitrary call/array pattern.
const INLINE_CONTEXTS = [
  {
    path: /^assets\/AccountDemoLock-[A-Za-z0-9_-]+\.js$/,
    owners: [
      'f61decc632e66d62b9445c7a5138fee89a6e531d5711a932dc5fe9e6952edf33',
      'e632652a7c4f98bc041e9308529072b411724807ac5246f7a2de6428544b067d',
    ],
    callee: '7dd103aeb77b0494bb5307c8c01d73fd2a93b347426b093d2a8bf1f5259d030f',
    callees: [
      '7dd103aeb77b0494bb5307c8c01d73fd2a93b347426b093d2a8bf1f5259d030f',
      '290184ba3f12f23ff88a1da320ff700d6f229d9563d157188b3c25289b492bae',
    ],
  },
  {
    path: /^assets\/settingsStore-[A-Za-z0-9_-]+\.js$/,
    // Both complete compiler outputs were reviewed: only imported/local t/n aliases differ.
    owners: [
      'b1544f1388a32e4f61b70b6e8aad531784a65e94706c09a5fdcb00d1504e5cae',
      '6540f04f938122a30358f285a7c660553de5e4467ea8f2146bfd16501ad53e92',
    ],
  },
];
function inlineSlots(source, chunkPath, pair) {
  const policy = INLINE_CONTEXTS.find((row) => row.path.test(chunkPath ?? ''));
  if (!policy || !pair) return [];
  const slots = [];
  function visit(node) {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      publicConfigHash(node.text) === pair.originSha256
    ) {
      literal(node, source); // Reject escapes rather than classifying a different byte spelling.
      let owner = node.parent;
      while (owner && !(policy.callee ? ts.isArrowFunction(owner) : ts.isFunctionDeclaration(owner)))
        owner = owner.parent;
      if (owner) {
        const start = owner.getStart(source),
          raw = owner.getText(source);
        const normalized =
          raw.slice(0, node.getStart(source) + 1 - start) +
          '<reviewed-public-origin>' +
          raw.slice(node.end - 1 - start);
        let valid = (policy.owners ?? [policy.owner]).includes(publicConfigHash(normalized));
        if (policy.callee) {
          const call = node.parent;
          valid = valid && ts.isCallExpression(call) && ts.isIdentifier(call.expression) && owner.body === call;
          if (valid) {
            const definitions = source.statements.filter(
              (item) => ts.isFunctionDeclaration(item) && item.name?.text === call.expression.text
            );
            valid =
              definitions.length === 1 &&
              (policy.callees ?? [policy.callee]).includes(publicConfigHash(definitions[0].getText(source)));
          }
        } else valid = valid && owner.parent === source;
        if (valid)
          slots.push({
            ...pair,
            context: policy.callee ? 'disabled-local-reader-gate' : 'assistant-account-scope',
            start: node.getStart(source) + 1,
            end: node.end - 1,
          });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return slots;
}

/** Locate only complete, static, production Vite environment objects. No substring exemption. */
export function publicEnvironmentSlots(code, chunkPath, pair) {
  if (typeof code !== 'string' || Buffer.byteLength(code) > MAX_CHUNK) refuse();
  if (!code.includes('VITE_SUPABASE_URL') && !INLINE_CONTEXTS.some((row) => row.path.test(chunkPath ?? ''))) return [];
  const source = ts.createSourceFile('artifact.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (source.parseDiagnostics.length) refuse();
  const slots = [];
  function visit(node) {
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.some(
        (p) =>
          ts.isPropertyAssignment(p) &&
          p.name &&
          (ts.isComputedPropertyName(p.name)
            ? p.name.expression.getText(source).includes('VITE_SUPABASE_URL')
            : p.name.text === 'VITE_SUPABASE_URL')
      )
    ) {
      const fields = new Map();
      for (const p of node.properties) {
        if (!ts.isPropertyAssignment(p) || (!ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name))) refuse();
        const name = ts.isIdentifier(p.name) ? p.name.text : literal(p.name, source);
        if (!ENV_KEYS.has(name) || fields.has(name)) refuse();
        fields.set(name, { value: literal(p.initializer, source), node: p.initializer });
      }
      for (const name of [...BASE, ...CLIENT.slice(0, 3)]) if (!fields.has(name)) refuse();
      const value = (name) => fields.get(name)?.value;
      if (
        value('BASE_URL') !== '/' ||
        value('DEV') !== false ||
        value('PROD') !== true ||
        value('SSR') !== false ||
        value('MODE') !== 'production' ||
        value('VITE_DATA_PLANE') !== 'supabase'
      )
        refuse();
      for (const name of QUALIFICATIONS) if (fields.has(name) && value(name) !== '') refuse();
      const pair = approvedPair(value('VITE_SUPABASE_URL'), value('VITE_SUPABASE_ANON_KEY'));
      const writerProfile = approvedWriterProfile(value(writerPolicy.field), pair);
      const url = fields.get('VITE_SUPABASE_URL').node;
      slots.push({
        ...pair,
        ...(writerProfile ? { writerProfile } : {}),
        context: 'vite-environment',
        start: url.getStart(source) + 1,
        end: url.end - 1,
      });
      if (slots.length > 24) refuse();
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  slots.push(...inlineSlots(source, chunkPath, pair));
  slots.sort((a, b) => a.start - b.start);
  if (slots.length > 24) refuse();
  return slots;
}

function entryFrom(bundle) {
  const entries = Object.values(bundle).filter(
    (item) => item.type === 'chunk' && item.isEntry && item.name === 'index'
  );
  if (entries.length !== 1) refuse();
  const entry = entries[0],
    body = Buffer.from(entry.code);
  if (!/^assets\/index-[A-Za-z0-9_-]+\.js$/.test(entry.fileName) || body.length < 1 || body.length > MAX_CHUNK)
    refuse();
  return { path: '/' + entry.fileName, bytes: body.length, sha256: publicConfigHash(body) };
}

/** A build receipt is configuration classification, never Auth/RLS or writer capability. */
export function createPublicClientConfigReceipt(bundle, version, sourceCommit, env) {
  if (!String(env.VITE_SUPABASE_URL ?? '').startsWith('https:')) return null;
  const pair = approvedPair(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  if (env.VITE_DATA_PLANE && env.VITE_DATA_PLANE !== 'supabase') refuse();
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('VITE_') && (!ENV_KEYS.has(name) || (QUALIFICATIONS.includes(name) && value !== ''))) refuse();
  }
  const writerProfile = approvedWriterProfile(env[writerPolicy.field], pair);
  if (!sourceCommit) return null; // Unbound builds retain the scanner's ordinary host refusal.
  if (!COMMIT.test(sourceCommit) || typeof version !== 'string' || !/^[\w.+-]{1,64}$/.test(version)) refuse();
  const chunks = [];
  for (const item of Object.values(bundle)) {
    if (item.type !== 'chunk') continue;
    const slots = publicEnvironmentSlots(item.code, item.fileName, pair);
    if (!slots.length) continue;
    if (
      !CHUNK_PATH.test(item.fileName) ||
      slots.some(
        (s) =>
          s.policy !== pair.policy ||
          s.originSha256 !== pair.originSha256 ||
          s.keySha256 !== pair.keySha256 ||
          (s.context === 'vite-environment' && (s.writerProfile ?? '') !== writerProfile)
      )
    )
      refuse();
    const body = Buffer.from(item.code);
    chunks.push({ path: item.fileName, bytes: body.length, sha256: publicConfigHash(body), slots });
  }
  if (
    !chunks.length ||
    chunks.length > 32 ||
    !chunks.some((chunk) => chunk.slots.some((slot) => slot.context === 'vite-environment'))
  )
    refuse();
  chunks.sort((a, b) => a.path.localeCompare(b.path));
  return {
    format: FORMAT,
    sourceCommit,
    version,
    entry: entryFrom(bundle),
    pair,
    chunks,
    ...(writerProfile ? { writerProfile } : {}),
  };
}

export function familyPublicClientConfig(version, sourceCommit) {
  let env;
  return {
    name: 'family-public-client-config',
    apply: 'build',
    configResolved(config) {
      env = config.env;
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const receipt = createPublicClientConfigReceipt(bundle, version, sourceCommit, env);
        if (receipt)
          this.emitFile({ type: 'asset', fileName: PUBLIC_CONFIG_ASSET, source: JSON.stringify(receipt) + '\n' });
      },
    },
  };
}

function file(root, name, limit) {
  if (name !== PUBLIC_CONFIG_ASSET && name !== 'family-build.json' && !CHUNK_PATH.test(name)) refuse();
  if (name.startsWith('assets/')) {
    const parent = lstatSync(path.join(root, 'assets'));
    if (!parent.isDirectory() || parent.isSymbolicLink()) refuse();
  }
  const target = path.join(root, name),
    stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > limit) refuse();
  return readFileSync(target);
}

/** Independently re-parse finalized bytes; the receipt cannot approve itself. */
export function scanApprovedPublicConfig(root, expectedSourceCommit) {
  if (!existsSync(path.join(root, PUBLIC_CONFIG_ASSET))) return null;
  if (typeof expectedSourceCommit !== 'string' || !COMMIT.test(expectedSourceCommit)) refuse();
  const receipt = JSON.parse(file(root, PUBLIC_CONFIG_ASSET, 128 * 1024).toString('utf8'));
  if (
    !exactKeys(receipt, [
      'format',
      'sourceCommit',
      'version',
      'entry',
      'pair',
      'chunks',
      ...(receipt.writerProfile !== undefined ? ['writerProfile'] : []),
    ]) ||
    receipt.format !== FORMAT ||
    receipt.sourceCommit !== expectedSourceCommit ||
    typeof receipt.version !== 'string' ||
    !/^[\w.+-]{1,64}$/.test(receipt.version)
  )
    refuse();
  if (
    !exactKeys(receipt.pair, ['policy', 'originSha256', 'keySha256']) ||
    ORIGINS[receipt.pair.originSha256] !== receipt.pair.policy ||
    !HASH.test(receipt.pair.keySha256)
  )
    refuse();
  const writerProfile = approvedWriterProfile(receipt.writerProfile, receipt.pair);
  if (receipt.writerProfile !== undefined && !writerProfile) refuse();
  const descriptor = JSON.parse(file(root, 'family-build.json', 8192).toString('utf8'));
  if (
    !exactKeys(descriptor, ['format', 'version', 'entry']) ||
    descriptor.format !== 'family.build.v1' ||
    descriptor.version !== receipt.version ||
    JSON.stringify(descriptor.entry) !== JSON.stringify(receipt.entry)
  )
    refuse();
  if (
    !exactKeys(receipt.entry, ['path', 'bytes', 'sha256']) ||
    !/^\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(receipt.entry.path)
  )
    refuse();
  const entry = file(root, receipt.entry.path.slice(1), MAX_CHUNK);
  if (entry.length !== receipt.entry.bytes || publicConfigHash(entry) !== receipt.entry.sha256) refuse();
  if (!Array.isArray(receipt.chunks) || !receipt.chunks.length || receipt.chunks.length > 32) refuse();
  const views = new Map();
  let hasEnvironment = false;
  for (const chunk of receipt.chunks) {
    if (!exactKeys(chunk, ['path', 'bytes', 'sha256', 'slots']) || views.has(chunk.path)) refuse();
    const bytes = file(root, chunk.path, MAX_CHUNK),
      code = bytes.toString('utf8');
    if (bytes.length !== chunk.bytes || publicConfigHash(bytes) !== chunk.sha256) refuse();
    const slots = publicEnvironmentSlots(code, chunk.path, receipt.pair);
    if (
      !slots.length ||
      JSON.stringify(slots) !== JSON.stringify(chunk.slots) ||
      slots.some(
        (s) =>
          s.policy !== receipt.pair.policy ||
          s.originSha256 !== receipt.pair.originSha256 ||
          s.keySha256 !== receipt.pair.keySha256 ||
          (s.context === 'vite-environment' && (s.writerProfile ?? '') !== writerProfile)
      )
    )
      refuse();
    hasEnvironment ||= slots.some((slot) => slot.context === 'vite-environment');
    let classified = code;
    for (const slot of [...slots].reverse()) {
      classified = classified.slice(0, slot.start) + ' '.repeat(slot.end - slot.start) + classified.slice(slot.end);
    }
    views.set(chunk.path, classified);
  }
  if (!hasEnvironment) refuse();
  return { views, sourceCommit: receipt.sourceCommit, pair: receipt.pair, chunks: views.size };
}
