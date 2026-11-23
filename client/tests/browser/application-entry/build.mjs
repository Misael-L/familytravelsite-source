// Build the ordinary application, without a substitute SDK or planner installation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const output = process.env.FAMILY_ENTRY_OUTPUT ?? process.env.D6_OUTPUT,
  fixturePath = process.env.FAMILY_ENTRY_FIXTURE ?? process.env.D6_FIXTURE;
for (const value of [output, fixturePath])
  if (!value || !/^\/private\/tmp\/trek-u03d(?:[6-9]|10|11|12|14|15|16)-/.test(value))
    throw Error('Use private /private/tmp/trek-u03d6- paths');
assert.equal((await stat(fixturePath)).mode & 0o077, 0, 'Credential fixture must be private');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
assert.equal(fixture.api, 'http://127.0.0.1:55331');
const driver = process.env.FAMILY_ENTRY_LIFECYCLE_DRIVER === '1';
const privateDriver = process.env.FAMILY_ENTRY_PRIVATE_MEMORY_DRIVER === '1';
if (process.env.FAMILY_ENTRY_PRIVATE_MEMORY_DRIVER) assert.ok(privateDriver, 'Unknown private memory driver mode');
const preparationDriver = process.env.FAMILY_ENTRY_PUBLIC_IMAGE_PREPARATION_DRIVER === '1';
if (process.env.FAMILY_ENTRY_PUBLIC_IMAGE_PREPARATION_DRIVER)
  assert.ok(preparationDriver, 'Unknown image preparation driver mode');
const imagesDriver = process.env.FAMILY_ENTRY_PUBLIC_IMAGES_DRIVER === '1';
if (process.env.FAMILY_ENTRY_PUBLIC_IMAGES_DRIVER) assert.ok(imagesDriver, 'Unknown public-image driver mode');
if (imagesDriver) {
  assert.equal(process.env.FAMILY_ENTRY_OFFLINE_READ_QUALIFICATION, 'local-v1');
  assert.equal(driver, false);
  assert.ok(!process.env.FAMILY_ENTRY_SOURCE_BOUNDARY);
}
if (preparationDriver) {
  assert.equal(process.env.FAMILY_ENTRY_OFFLINE_READ_QUALIFICATION, 'local-v1');
  assert.equal(driver, false);
  assert.equal(imagesDriver, false);
  assert.ok(!process.env.FAMILY_ENTRY_SOURCE_BOUNDARY);
}
if (privateDriver) {
  assert.equal(process.env.FAMILY_ENTRY_OFFLINE_READ_QUALIFICATION, 'local-v1');
  assert.equal(driver, false);
  assert.equal(imagesDriver, false);
  assert.equal(preparationDriver, false);
  assert.ok(!process.env.FAMILY_ENTRY_SOURCE_BOUNDARY);
}
const readinessDriver = process.env.FAMILY_ENTRY_PREPARATION_READINESS_DRIVER === '1';
if (process.env.FAMILY_ENTRY_PREPARATION_READINESS_DRIVER) assert.ok(readinessDriver, 'Unknown readiness driver mode');
if (readinessDriver) {
  assert.equal(process.env.FAMILY_ENTRY_OFFLINE_READ_QUALIFICATION, 'local-v1');
  assert.ok(!driver && !imagesDriver && !preparationDriver && !privateDriver);
  assert.ok(!process.env.FAMILY_ENTRY_SOURCE_BOUNDARY);
}
const boundary = process.env.FAMILY_ENTRY_SOURCE_BOUNDARY === 'localhost-v1';
if (process.env.FAMILY_ENTRY_SOURCE_BOUNDARY) assert.ok(boundary, 'Unknown source boundary mode');
if (boundary) {
  assert.equal(process.env.FAMILY_ENTRY_OFFLINE_READ_QUALIFICATION, 'local-v1');
  assert.equal(driver, false, 'The source boundary build cannot include the cleanup driver');
}
const endpoint = boundary ? 'http://localhost:55331' : fixture.api;
if (driver)
  assert.equal(
    process.env.FAMILY_ENTRY_OFFLINE_READ_QUALIFICATION,
    'local-v1',
    'The lifecycle driver requires explicit loopback qualification'
  );
const dist = path.join(output, 'actual-dist');
try {
  await stat(dist);
  throw Error('Refusing to overwrite a prior build');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true, mode: 0o700 });
process.chdir(root); // Tailwind must resolve the actual application content paths.
// Match build:web's dependency order. Vite resolves the installed workspace dist,
// so source-only changes (including translated messages) must be compiled first.
for (const workspace of ['@family/shared-compat', '@trek/shared'])
  execFileSync('npm', ['run', 'build', '--workspace=' + workspace], {
    cwd: path.dirname(root),
    stdio: 'inherit',
  });
const require = createRequire(path.join(root, 'package.json'));
const { build } = await import(require.resolve('vite'));
const built = await build({
  configFile: path.join(root, 'vite.config.js'),
  root,
  mode: 'production',
  envDir: output,
  define: {
    'import.meta.env.VITE_FAMILY_OFFLINE_READ_QUALIFICATION': JSON.stringify(
      process.env.FAMILY_ENTRY_OFFLINE_READ_QUALIFICATION === 'local-v1' ? 'local-v1' : ''
    ),
    'import.meta.env.VITE_FAMILY_CACHE_LIFECYCLE_DRIVER': JSON.stringify(driver ? 'local-driver-v1' : ''),
    'import.meta.env.VITE_DATA_PLANE': JSON.stringify('supabase'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(endpoint),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(fixture.anon_key),
  },
  build: {
    outDir: dist,
    emptyOutDir: false,
    ...(driver
      ? {
          rollupOptions: {
            preserveEntrySignatures: 'exports-only',
            input: {
              index: path.join(root, 'index.html'),
              'cache-lifecycle-driver': path.join(root, 'tests/browser/family-offline-lifecycle/cache-driver.mjs'),
            },
          },
        }
      : imagesDriver || preparationDriver || privateDriver || readinessDriver
        ? {
            rollupOptions: {
              preserveEntrySignatures: 'exports-only',
              input: {
                index: path.join(root, 'index.html'),
                ...(imagesDriver
                  ? {
                      'public-variant-bytes-driver': path.join(
                        root,
                        'tests/browser/family-offline-lifecycle/variant-byte-driver.mjs'
                      ),
                    }
                  : privateDriver
                    ? {
                        'private-file-memory-driver': path.join(
                          root,
                          'tests/browser/family-offline-lifecycle/private-file-memory-driver.mjs'
                        ),
                      }
                    : readinessDriver
                      ? {
                          'preparation-readiness-driver': path.join(
                            root,
                            'tests/browser/family-offline-lifecycle/preparation-readiness-driver.mjs'
                          ),
                        }
                      : {
                          'public-image-preparation-driver': path.join(
                            root,
                            'tests/browser/family-offline-lifecycle/public-image-preparation-driver.mjs'
                          ),
                        }),
              },
            },
          }
        : {}),
  },
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function hashes(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(prefix, entry.name),
      file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await hashes(file, name));
    else if (entry.isFile()) result[name] = digest(await readFile(file));
  }
  return result;
}
const outputs = (Array.isArray(built) ? built : [built]).flatMap((bundle) => bundle.output ?? []);
const driverEntries = outputs.filter(
  (entry) => entry.type === 'chunk' && entry.isEntry && entry.name === 'cache-lifecycle-driver'
);
if (driver) {
  assert.equal(driverEntries.length, 1);
  assert.deepEqual([...driverEntries[0].exports].sort(), ['holdRetirement', 'releaseRetirement']);
}
const imageEntries = outputs.filter(
  (entry) => entry.type === 'chunk' && entry.isEntry && entry.name === 'public-variant-bytes-driver'
);
assert.equal(imageEntries.length, imagesDriver ? 1 : 0);
if (imagesDriver)
  assert.deepEqual([...imageEntries[0].exports].sort(), ['PUBLIC_VARIANT_LIMITS', 'createPublicVariantCache']);
const preparationEntries = outputs.filter(
  (entry) => entry.type === 'chunk' && entry.isEntry && entry.name === 'public-image-preparation-driver'
);
assert.equal(preparationEntries.length, preparationDriver ? 1 : 0);
if (preparationDriver)
  assert.deepEqual([...preparationEntries[0].exports].sort(), [
    'PUBLIC_IMAGE_PREPARATION_LIMIT',
    'createPublicVariantCache',
    'openPublicImagePreparation',
  ]);
const privateEntries = outputs.filter(
  (entry) => entry.type === 'chunk' && entry.isEntry && entry.name === 'private-file-memory-driver'
);
assert.equal(privateEntries.length, privateDriver ? 1 : 0);
if (privateDriver)
  assert.deepEqual([...privateEntries[0].exports].sort(), [
    'acquireFilePreview',
    'filePreviewRouteEpoch',
    'openPrivateFilePreparation',
    'setForcedOffline',
  ]);
const readinessEntries = outputs.filter(
  (entry) => entry.type === 'chunk' && entry.isEntry && entry.name === 'preparation-readiness-driver'
);
assert.equal(readinessEntries.length, readinessDriver ? 1 : 0);
if (readinessDriver)
  assert.deepEqual([...readinessEntries[0].exports].sort(), [
    'createPublicVariantCache',
    'filePreviewRouteEpoch',
    'openPreparationReadiness',
    'openPrivateFilePreparation',
    'openPublicImagePreparation',
    'setForcedOffline',
    'tripSyncManager',
  ]);
const recovery = outputs.find(
  (entry) => entry.type === 'chunk' && entry.isEntry && entry.name === 'device-work-recovery'
);
const reachable = new Set();
const visit = (name) => {
  if (reachable.has(name)) return;
  reachable.add(name);
  const entry = outputs.find((value) => value.type === 'chunk' && value.fileName === name);
  assert.ok(entry, 'Missing standalone dependency');
  for (const dep of [...entry.imports, ...entry.dynamicImports]) visit(dep);
};
if (recovery) visit(recovery.fileName);
const recoveryModules = [...reachable]
  .flatMap((name) => Object.keys(outputs.find((value) => value.fileName === name).modules ?? {}))
  .sort();
assert.ok(
  !recoveryModules.some((name) =>
    /(?:supabase|dexie|\/src\/(?:App\.|main\.|db\/offlineDb|sync\/mutationQueue|integrations\/family\/(?:repository|bootstrap)))/i.test(
      name
    )
  ),
  'Standalone entry imported application/account/queue dependencies'
);
const artifactHashes = await hashes(dist);
const drivers = Object.keys(artifactHashes).filter((n) => /^assets\/cache-lifecycle-driver-[^/]+\.js$/.test(n));
assert.equal(drivers.length, driver ? 1 : 0);
await writeFile(
  path.join(output, 'actual-build.json'),
  JSON.stringify(
    {
      entrypoint: 'client/index.html → src/main.tsx → App/bootstrap',
      sdk: 'installed real SDK; no replacement plugin',
      supabase_endpoint: endpoint,
      ...(boundary ? { source_boundary_alias: true, canonical_fixture_endpoint: fixture.api } : {}),
      vite_config_sha256: digest(await readFile(path.join(root, 'vite.config.js'))),
      artifact_hashes: artifactHashes,
      device_recovery: {
        enabled: !!recovery,
        entry: recovery?.fileName ?? null,
        chunks: [...reachable].sort(),
        modules: recoveryModules,
      },
      ...(driver ? { qualification_driver: drivers[0], qualification_driver_exports: driverEntries[0].exports } : {}),
      ...(readinessDriver
        ? {
            preparation_readiness_driver: readinessEntries[0].fileName,
            preparation_readiness_exports: readinessEntries[0].exports,
          }
        : {}),
      ...(privateDriver
        ? {
            private_file_memory_driver: privateEntries[0].fileName,
            private_file_memory_exports: privateEntries[0].exports,
          }
        : {}),
      ...(preparationDriver
        ? {
            public_image_preparation_driver: preparationEntries[0].fileName,
            public_image_preparation_exports: preparationEntries[0].exports,
          }
        : {}),
      ...(imagesDriver
        ? { public_variant_driver: imageEntries[0].fileName, public_variant_exports: imageEntries[0].exports }
        : {}),
    },
    null,
    2
  )
);
