// Production compiler/settings around test-only SDK responses. Never deploy these entrypoints.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

export const BROWSER_PROFILES = [
  { name: 'desktop', phone: false, viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false },
  { name: 'phone', phone: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  // Tablet browsers use the native desktop web layout at this width; native iPad shells are a separate platform.
  { name: 'tablet', phone: false, viewport: { width: 1024, height: 1366 }, isMobile: true, hasTouch: true },
];

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function syntheticSdk() {
  return {
    name: 'synthetic-sdk-only',
    enforce: 'pre',
    load(id) {
      const name = id.split('?')[0];
      const base = /\/(?:legacy\/data\/supabase|family-backend\/(?:src|dist)\/data\/supabase)\//;
      if (!base.test(name)) return;
      if (/\/client\.(?:ts|js)$/.test(name))
        return 'export const getSupabaseBrowserClient = () => globalThis.p04asSdk;';
      if (/\/env\.(?:ts|js)$/.test(name))
        return 'export const getSupabaseUrl = () => location.origin; export const getSupabaseAnonKey = () => "synthetic-not-a-key"; export const hasSupabaseEnv = () => true; export const getDataPlane = () => "supabase"; export const getMapboxAccessToken = () => undefined;';
    },
  };
}
async function assetHashes(directory, prefix = '') {
  const out = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(prefix, entry.name),
      file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(out, await assetHashes(file, name));
    else if (entry.isFile()) out[name] = digest(await readFile(file));
  }
  return out;
}
export async function serveProductionFixture({ root, output }) {
  if (!path.isAbsolute(output)) throw new Error('Browser evidence output must be absolute');
  const dist = path.join(output, 'fixture-dist');
  // Each run keeps its own build and evidence. Never overwrite an earlier capture.
  try {
    await stat(dist);
    throw new Error('Fixture build already exists; use a fresh evidence directory');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(output, { recursive: true });
  process.chdir(root); // Tailwind resolves the actual application's content paths from here.
  const require = createRequire(path.join(root, 'package.json'));
  const { build, preview } = await import(require.resolve('vite'));
  const entrypoints = ['planner-native', 'planner-availability'].map((name) => `tests/browser/${name}/index.html`);
  await build({
    configFile: path.join(root, 'vite.config.js'),
    root,
    mode: 'production',
    envDir: output,
    plugins: [syntheticSdk()],
    define: {
      'import.meta.env.VITE_DATA_PLANE': JSON.stringify('supabase'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fixture.invalid'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('synthetic-not-a-key'),
    },
    build: {
      outDir: dist,
      emptyOutDir: false,
      rolldownOptions: { input: entrypoints.map((entry) => path.join(root, entry)) },
    },
  });
  const receipt = {
    kind: 'production-build-with-synthetic-sdk-boundary',
    application_version: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version,
    vite_config_sha256: digest(await readFile(path.join(root, 'vite.config.js'))),
    entrypoints,
    artifact_hashes: await assetHashes(dist),
    service_worker_exercised: false,
    live_supabase_exercised: false,
  };
  await writeFile(path.join(output, 'production-build.json'), JSON.stringify(receipt, null, 2));
  return preview({
    configFile: false,
    root,
    envDir: output,
    build: { outDir: dist },
    preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
  });
}

const syntheticImages = new Map();
/** Real encoded WebP/JPEG/PNG bytes with distinguishable cover/hero dimensions. */
export function syntheticImage(pathname) {
  const kind = pathname.includes('/hero-')
    ? 'hero'
    : pathname.includes('/thumb-')
      ? 'thumb'
      : pathname.includes('/original-')
        ? 'original'
        : 'tile';
  let pending = syntheticImages.get(kind);
  if (!pending) {
    const dimensions = {
      hero: [1200, 800, 'webp'],
      thumb: [192, 128, 'webp'],
      original: [1600, 1067, 'jpeg'],
      tile: [256, 256, 'png'],
    }[kind];
    const [width, height, format] = dimensions;
    const sharp = createRequire(fileURLToPath(new URL('../../package.json', import.meta.url)))('sharp');
    pending = sharp({ create: { width, height, channels: 3, background: '#d8dee9' } })
      .toFormat(format)
      .toBuffer()
      .then((body) => ({ status: 200, contentType: `image/${format}`, body }));
    syntheticImages.set(kind, pending);
  }
  return pending;
}
