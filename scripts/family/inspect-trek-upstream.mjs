import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = 'https://github.com/liketrek/TREK';
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
function commit(root, ref) {
  const sha = git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('A SHA-1 Git commit is required.');
  return sha;
}
function tree(root, sha) {
  return new Map(git(root, ['ls-tree', '-r', '-z', '--full-tree', sha]).split('\0').filter(Boolean).map(entry => {
    const tab = entry.indexOf('\t'), [mode, kind, oid] = entry.slice(0, tab).split(' ');
    return [entry.slice(tab + 1), { mode, kind, oid }];
  }));
}
function localFile(root, name) {
  const absolute = path.resolve(root, name);
  if (!absolute.startsWith(root + path.sep)) throw new Error('A source path escaped the integration checkout.');
  // A parent directory can itself be a link. Never inspect its target as repository source.
  let parent = root;
  for (const segment of name.split('/').slice(0, -1)) {
    parent = path.join(parent, segment);
    try { if (fs.lstatSync(parent).isSymbolicLink()) return { oid: null, mode: null, kind: 'unhashed' }; }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null; throw error; }
  }
  let stat;
  try { stat = fs.lstatSync(absolute); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null; throw error; }
  if (stat.isSymbolicLink()) {
    const bytes = Buffer.from(fs.readlinkSync(absolute));
    return { oid: blob(bytes), mode: '120000', kind: 'blob' };
  }
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) return { oid: null, mode: null, kind: 'unhashed' };
  // Raw Git blob identity: no filters, index update, Git write or traversal through symlinks.
  return { oid: blob(fs.readFileSync(absolute)), mode: stat.mode & 0o111 ? '100755' : '100644', kind: 'blob' };
}
function blob(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
const same = (a, b) => a === null && b === null || !!a && !!b && a.oid !== null && a.oid === b.oid && a.mode === b.mode && a.kind === b.kind;
function state(base, local, upstream) {
  if (local?.kind === 'unhashed') return 'manual-file-review';
  if (same(base, upstream)) return same(local, base) ? 'unchanged' : base ? 'retain-local-change' : 'retain-local-addition';
  if (same(local, upstream)) return 'already-target';
  if (same(local, base)) return upstream ? 'upstream-change-only' : 'upstream-deletion-only';
  return upstream ? 'overlap-review' : 'local-change-upstream-deleted';
}
function domain(name) {
  if (/^(family-backend|family-shared)\//.test(name) || name.startsWith('client/src/integrations/family/')) return 'Family backend and adapters';
  if (/^server\//.test(name)) return 'Upstream Nest server';
  if (/^(ios|android|native|watchos)\//.test(name) || name.includes('/native/')) return 'Native app support';
  if (name.startsWith('shared/src/i18n/')) return 'Translations';
  if (name.startsWith('shared/')) return 'Shared contracts';
  if (/^client\/src\/(sync|db|repo)\//.test(name)) return 'Browser data and offline core';
  if (/^client\/src\/(api|store)\//.test(name)) return 'API and state';
  if (name.startsWith('client/')) return 'Web views and assets';
  return 'Build tooling documentation and other files';
}
const seamPaths = [
  'client/src/db/offlineDb.ts', 'client/src/sync/mutationQueue.ts', 'client/src/store/authStore.ts',
  'client/src/repo/packingRepo.ts', 'client/src/store/slices/packingSlice.ts',
  'client/src/api/client.ts', 'client/src/repo/placeRepo.ts', 'client/src/repo/fileRepo.ts',
  'client/src/store/settingsStore.ts', 'client/src/App.tsx', 'client/src/main.tsx',
  'shared/src/place/place.schema.ts', 'shared/src/reservation/reservation.schema.ts',
  'shared/src/settings/settings.schema.ts', 'shared/src/budget/budget.schema.ts',
  'shared/src/packing/packing.schema.ts',
];
/** Read-only three-way source inventory. Overlap is a review requirement, not a proven merge conflict. */
export function inspectTrekUpstream({ root, reference, target, schemaRoot }) {
  root = path.resolve(root); reference = path.resolve(reference);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/family-integration/native-presentation.json'), 'utf8'));
  if (manifest.source_repository !== repository) throw new Error('The integration baseline must identify the official TREK repository.');
  const baseline = commit(reference, manifest.upstream_commit), targetCommit = commit(reference, target);
  git(reference, ['merge-base', '--is-ancestor', baseline, targetCommit]);
  const base = tree(reference, baseline), next = tree(reference, targetCommit);
  const owned = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const paths = [...new Set([...base.keys(), ...next.keys(), ...owned])].sort();
  const counts = {}, domains = {}, changes = [], fingerprints = [];
  for (const name of paths) {
    const b = base.get(name) ?? null, u = next.get(name) ?? null, l = localFile(root, name);
    const disposition = state(b, l, u), section = domain(name);
    counts[disposition] = (counts[disposition] ?? 0) + 1;
    domains[section] ??= {};
    domains[section][disposition] = (domains[section][disposition] ?? 0) + 1;
    if (l) fingerprints.push(`${name}\0${l.mode}\0${l.oid}\n`);
    if (disposition !== 'unchanged') changes.push({ path: name, domain: section, disposition,
      base: b?.oid ?? null, local: l?.oid ?? null, upstream: u?.oid ?? null });
  }
  const seams = seamPaths.map(name => {
    const b = base.get(name) ?? null, u = next.get(name) ?? null;
    return { path: name, base_exists: b !== null, target_exists: u !== null,
      upstream_unchanged: b !== null && u !== null && same(b, u),
      local_disposition: changes.find(row => row.path === name)?.disposition ?? 'unchanged' };
  });
  let schema = null;
  if (schemaRoot) {
    const directory = path.join(path.resolve(schemaRoot), 'supabase/migrations');
    const files = fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
    schema = { migration_count: files.length, hashes: Object.fromEntries(files.map(name => [name,
      createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex')])) };
  }
  return { version: 1, generated_at: new Date().toISOString(), source_repository: repository,
    baseline_version: manifest.source_version, baseline_commit: baseline, requested_target: target, target_commit: targetCommit,
    integration_head: commit(root, 'HEAD'), integration_branch: git(root, ['branch', '--show-current']).trim(),
    working_source_fingerprint: createHash('sha256').update(fingerprints.join('')).digest('hex'),
    method: 'Raw Git blob/mode comparison. No merge attempted; clean source changes are not runtime compatibility proof.',
    counts, domains, seams, changes, schema,
    repository_mutated: false, database_connected: false, network_requested: false, upgrade_performed: false };
}
function main(args) {
  const options = { root: fileURLToPath(new URL('../../', import.meta.url)) };
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!['--root', '--reference', '--target', '--schema-root', '--output'].includes(flag) || !value)
      throw new Error('Use --reference PATH --target REF [--root PATH] [--schema-root PATH] [--output NEW_FILE].');
    const key = { '--root': 'root', '--reference': 'reference', '--target': 'target', '--schema-root': 'schemaRoot', '--output': 'output' }[flag];
    options[key] = value;
  }
  if (!options.reference || !options.target) throw new Error('A local reference checkout and explicit target are required.');
  const report = inspectTrekUpstream(options), text = JSON.stringify(report, null, 2) + '\n';
  if (options.output) {
    // Refuse replacing an existing report or source file.
    const fd = fs.openSync(options.output, 'wx', 0o600);
    try { fs.writeFileSync(fd, text); } finally { fs.closeSync(fd); }
    process.stdout.write(JSON.stringify({ output: path.resolve(options.output), baseline: report.baseline_version,
      target_commit: report.target_commit, counts: report.counts, upgrade_performed: false }) + '\n');
  } else process.stdout.write(text);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
