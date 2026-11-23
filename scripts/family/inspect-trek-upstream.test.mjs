import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectTrekUpstream } from './inspect-trek-upstream.mjs';

const script = fileURLToPath(new URL('./inspect-trek-upstream.mjs', import.meta.url));
const run = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function put(root, name, bytes) { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), bytes); }
function init(root) {
  mkdirSync(root); run(root, ['init', '--initial-branch=main']);
  run(root, ['config', 'user.email', 'fixture@invalid']); run(root, ['config', 'user.name', 'Fixture']);
}
function save(root, message) { run(root, ['add', '--all']); run(root, ['commit', '-m', message]); return run(root, ['rev-parse', 'HEAD']); }
function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'trek-upstream-inspection-')), reference = join(folder, 'reference'), root = join(folder, 'integration');
  init(reference); init(root);
  const files = { 'client/src/db/offlineDb.ts': 'cache original\n', 'client/src/clean.ts': 'clean original\n',
    'client/src/both.ts': 'both original\n', 'client/src/gone.ts': 'delete original\n',
    'client/src/adopted.ts': 'adopt original\n', 'client/src/local.ts': 'local original\n' };
  for (const [name, content] of Object.entries(files)) { put(reference, name, content); put(root, name, content); }
  const baseline = save(reference, 'Baseline'); run(reference, ['tag', 'v5.0.1']);
  put(root, 'docs/family-integration/native-presentation.json', JSON.stringify({ source_repository: 'https://github.com/liketrek/TREK',
    source_version: '5.0.1', upstream_commit: baseline, exact_files: [] }));
  put(root, '.gitignore', '.env\n'); save(root, 'Family baseline');
  put(reference, 'client/src/clean.ts', 'clean upstream\n'); put(reference, 'client/src/both.ts', 'both upstream\n');
  put(reference, 'client/src/adopted.ts', 'already upstream\n'); put(reference, 'client/src/new.ts', 'new upstream\n');
  rmSync(join(reference, 'client/src/gone.ts')); const target = save(reference, 'Target'); run(reference, ['tag', 'v5.1.2']);
  put(root, 'client/src/both.ts', 'Family modification\n'); put(root, 'client/src/adopted.ts', 'already upstream\n');
  put(root, 'client/src/local.ts', 'local modification\n'); put(root, 'client/src/integrations/family/owned.ts', 'Family-only\n');
  put(root, '.env', 'SENSITIVE_SECRET_FIXTURE_DO_NOT_REPORT');
  return { folder, root, reference, baseline, target, close: () => rmSync(folder, { recursive: true, force: true }) };
}
function inspect(f, extra = {}) { return inspectTrekUpstream({ root: f.root, reference: f.reference, target: 'v5.1.2', ...extra }); }
function row(report, name) { return report.changes.find(r => r.path === name); }
function qualified(name, fn) { test(name, () => { const f = setup(); try { fn(f); } finally { f.close(); } }); }

qualified('three-way inventory separates upstream-only changes, overlap, existing adoption and Family-only work', f => {
  const r = inspect(f);
  assert.equal(row(r, 'client/src/clean.ts').disposition, 'upstream-change-only');
  assert.equal(row(r, 'client/src/both.ts').disposition, 'overlap-review');
  assert.equal(row(r, 'client/src/adopted.ts').disposition, 'already-target');
  assert.equal(row(r, 'client/src/new.ts').disposition, 'upstream-change-only');
  assert.equal(row(r, 'client/src/local.ts').disposition, 'retain-local-change');
  assert.equal(row(r, 'client/src/integrations/family/owned.ts').disposition, 'retain-local-addition');
  assert.equal(r.baseline_commit, f.baseline); assert.equal(r.target_commit, f.target);
});
qualified('deletion is clean only while the current file is the original baseline', f => {
  assert.equal(row(inspect(f), 'client/src/gone.ts').disposition, 'upstream-deletion-only');
  put(f.root, 'client/src/gone.ts', 'Family recovery requirement\n');
  assert.equal(row(inspect(f), 'client/src/gone.ts').disposition, 'local-change-upstream-deleted');
});
qualified('reports an unchanged critical seam only when both upstream versions contain it', f => {
  const r = inspect(f);
  assert.equal(r.seams.find(x => x.path === 'client/src/db/offlineDb.ts').upstream_unchanged, true);
  assert.equal(r.seams.find(x => x.path === 'client/src/sync/mutationQueue.ts').upstream_unchanged, false);
});
qualified('inspection changes neither working source nor the Git index/HEAD and excludes ignored secrets', f => {
  const before = run(f.root, ['status', '--porcelain=v1']), head = run(f.root, ['rev-parse', 'HEAD']);
  const first = inspect(f), second = inspect(f);
  assert.equal(first.working_source_fingerprint, second.working_source_fingerprint);
  assert.equal(run(f.root, ['status', '--porcelain=v1']), before); assert.equal(run(f.root, ['rev-parse', 'HEAD']), head);
  assert.equal(first.repository_mutated, false); assert.equal(first.upgrade_performed, false);
  assert.equal(JSON.stringify(first).includes('SENSITIVE_SECRET'), false); assert.equal(row(first, '.env'), undefined);
});
qualified('does not follow an individual source symlink', f => {
  const destination = join(f.folder, 'outside'); writeFileSync(destination, 'OUTSIDE_SOURCE_NOT_CONTENT');
  rmSync(join(f.root, 'client/src/clean.ts')); symlinkSync(destination, join(f.root, 'client/src/clean.ts'));
  const r = inspect(f); assert.equal(row(r, 'client/src/clean.ts').disposition, 'overlap-review');
  assert.equal(JSON.stringify(r).includes('OUTSIDE_SOURCE_NOT_CONTENT'), false);
});
qualified('does not inspect files through a symlinked directory', f => {
  const outside = join(f.folder, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'clean.ts'), 'OUTSIDE');
  rmSync(join(f.root, 'client/src'), { recursive: true }); symlinkSync(outside, join(f.root, 'client/src'));
  assert.equal(row(inspect(f), 'client/src/clean.ts').disposition, 'manual-file-review');
});
qualified('large source files require review instead of being misclassified as absent or compatible', f => {
  put(f.root, 'client/src/clean.ts', Buffer.alloc(8 * 1024 * 1024 + 1, 65));
  assert.equal(row(inspect(f), 'client/src/clean.ts').disposition, 'manual-file-review');
});
qualified('optional schema fingerprinting reads migration bytes without using a database', f => {
  put(f.folder, 'schema/supabase/migrations/001.sql', 'select 1;\n');
  const r = inspect(f, { schemaRoot: join(f.folder, 'schema') });
  assert.equal(r.schema.migration_count, 1); assert.match(r.schema.hashes['001.sql'], /^[0-9a-f]{64}$/);
  assert.equal(r.database_connected, false); assert.equal(r.network_requested, false);
});
qualified('refuses a missing target without changing either checkout', f => {
  const before = run(f.root, ['status', '--porcelain=v1']);
  assert.throws(() => inspect(f, { target: 'not-a-ref' })); assert.equal(run(f.root, ['status', '--porcelain=v1']), before);
});
qualified('requires the official baseline identity and refuses an unrelated target history', f => {
  put(f.root, 'docs/family-integration/native-presentation.json', JSON.stringify({ source_repository: 'https://other.invalid', upstream_commit: f.baseline }));
  assert.throws(() => inspect(f), /official TREK/);
  put(f.root, 'docs/family-integration/native-presentation.json', JSON.stringify({ source_repository: 'https://github.com/liketrek/TREK', source_version: '5.0.1', upstream_commit: f.baseline }));
  const unrelated = run(f.reference, ['commit-tree', `${f.target}^{tree}`, '-m', 'Unrelated history']);
  assert.throws(() => inspect(f, { target: unrelated }));
});
qualified('CLI writes a new private report but refuses overwriting it or accepting unknown options', f => {
  const output = join(f.folder, 'report.json'), args = ['--root', f.root, '--reference', f.reference, '--target', 'v5.1.2', '--output', output];
  const success = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }); assert.equal(success.status, 0, success.stderr);
  const before = readFileSync(output, 'utf8');
  assert.equal(spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }).status, 1);
  assert.equal(readFileSync(output, 'utf8'), before);
  assert.equal(spawnSync(process.execPath, [script, '--apply', 'yes'], { encoding: 'utf8' }).status, 1);
});
