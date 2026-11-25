#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
assert.ok(!args.length || (args.length === 2 && args[0] === '--root'), 'Use --root <checkout>');
const root = resolve(args[1] ?? fileURLToPath(new URL('../../', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'docs/family-backend-carryover.json'), 'utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.sourceCommit, '247b76ea94942e511a663f3f840c81821c556fc5');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const expected = new Set();
const patches = new Map();
function checkedPath(path, prefix) {
  assert.ok(
    typeof path === 'string' &&
      path.startsWith(prefix) &&
      !path.split('/').some((p) => !p || p === '..' || p === '.'),
    `Invalid recorded path: ${path}`,
  );
  const full = resolve(root, path);
  assert.ok(full.startsWith(root + sep), 'Path outside checkout');
  for (let p = full; p !== root; p = dirname(p))
    assert.ok(!lstatSync(p).isSymbolicLink(), `Source/patch symlink: ${p}`);
  return full;
}
for (const patch of manifest.localPatches ?? []) {
  assert.ok(!patches.has(patch.path), `Duplicate local patch: ${patch.path}`);
  assert.ok(patch.reason?.trim() && patch.packet?.trim(), 'Local patch needs reason and packet');
  patches.set(patch.path, patch);
}
function verifyPatch(entry, base, baseHash) {
  const patch = patches.get(entry.path);
  if (!patch) return baseHash;
  patches.delete(entry.path);
  assert.equal(patch.baseSha256, baseHash, `Wrong patch base: ${entry.path}`);
  const patchFile = checkedPath(patch.patch, 'docs/family-backend-patches/');
  const bytes = readFileSync(patchFile);
  assert.equal(hash(bytes), patch.patchSha256, `Modified patch: ${entry.path}`);
  const stat = execFileSync('git', ['apply', '--numstat', '--', patchFile], {
    encoding: 'utf8',
    cwd: root,
  })
    .trim()
    .split('\n');
  assert.equal(stat.length, 1, 'Patch must touch exactly its declared file');
  assert.equal(stat[0].split('\t')[2], entry.path, 'Patch target mismatch');
  const work = mkdtempSync(resolve(tmpdir(), 'family-carryover-'));
  try {
    const target = resolve(work, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, base);
    execFileSync('git', ['apply', '--', patchFile], { cwd: work });
    assert.equal(hash(readFileSync(target)), patch.sha256, `Patched digest mismatch: ${entry.path}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return patch.sha256;
}
for (const entry of manifest.files) {
  assert.ok(entry.source.startsWith('client/src/'));
  assert.equal(entry.path, `family-backend/src/${entry.source.slice('client/src/'.length)}`);
  assert.ok(!entry.path.split('/').includes('..'));
  assert.ok(!expected.has(entry.path), `Duplicate import: ${entry.path}`);
  expected.add(entry.path);
  const original = execFileSync('git', ['show', `${manifest.sourceCommit}:${entry.source}`], { cwd: root });
  assert.equal(hash(original), entry.sha256, `Wrong source digest: ${entry.source}`);
  let currentHash = entry.sha256,
    base = original;
  if (entry.approvedRevision) {
    const revision = entry.approvedRevision;
    assert.match(revision.commit, /^[a-f0-9]{40}$/, `Invalid approved commit: ${entry.path}`);
    assert.ok(revision.reason?.trim(), `Missing revision reason: ${entry.path}`);
    execFileSync('git', ['merge-base', '--is-ancestor', revision.commit, 'HEAD'], { cwd: root });
    const approved = execFileSync('git', ['show', `${revision.commit}:${entry.path}`], { cwd: root });
    assert.equal(hash(approved), revision.sha256, `Wrong approved digest: ${entry.path}`);
    currentHash = revision.sha256;
    base = approved;
  }
  currentHash = verifyPatch(entry, base, currentHash);
  assert.equal(
    hash(readFileSync(checkedPath(entry.path, 'family-backend/src/'))),
    currentHash,
    `Modified import: ${entry.path}`,
  );
}
assert.equal(patches.size, 0, 'Patch refers to an unrecorded baseline');
for (const entry of manifest.additions ?? []) {
  assert.ok(entry.reason?.trim() && entry.packet?.trim(), 'Addition needs reason and packet');
  assert.ok(!expected.has(entry.path), `Duplicate addition: ${entry.path}`);
  assert.equal(
    hash(readFileSync(checkedPath(entry.path, 'family-backend/src/'))),
    entry.sha256,
    `Modified addition: ${entry.path}`,
  );
  expected.add(entry.path);
}
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Source symlink: ${full}`);
    if (entry.isDirectory()) walk(full);
    else assert.ok(expected.delete(relative(root, full)), `Unrecorded source file: ${full}`);
  }
}
walk(resolve(root, 'family-backend/src'));
assert.equal(expected.size, 0, 'A recorded source file is missing');
const pkg = JSON.parse(readFileSync(resolve(root, 'family-backend/package.json'), 'utf8'));
assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.112.2');
const revisions = manifest.files.filter((entry) => entry.approvedRevision).length;
console.log(
  `Family carryover verified: ${manifest.files.length} files; ${revisions} audited committed revisions, ${manifest.files.length - revisions} original baselines; ${manifest.localPatches?.length ?? 0} verified local patches; ${manifest.additions?.length ?? 0} recorded additions.`,
);
