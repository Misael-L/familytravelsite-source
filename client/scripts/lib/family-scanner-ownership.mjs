/*
 * Which copied Family entry points the RTL, theme, and i18n scanners may skip.
 *
 * The skip is only for hosts the member app does not import. `reachableFromApp`
 * walks `main.tsx` and `App.tsx`. A listed file that the walk reaches has to
 * leave this list. A Family file that exists in this client and is not on that
 * walk is unreachable too. Reachable Family compatibility modules stay scanned.
 * Active copied modules are not excluded to satisfy RTL, theme, or i18n
 * baselines.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Paths relative to client/src. A trailing slash is a directory. */
export const UNREACHABLE_FAMILY_ENTRIES = [
  'integrations/family/legacy/App.tsx',
  'integrations/family/legacy/main.tsx',
  'integrations/family/legacy/pages/DashboardPage.tsx',
  'integrations/family/legacy/pages/TripPlannerPage.tsx',
  'integrations/family/legacy/pages/LoginPage.tsx',
  'integrations/family/legacy/pages/resetPassword/',
];

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
const SOURCE_EXT = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.css'];

const REAL_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

let reachedReal = null;

function reachedRealFamily() {
  if (!reachedReal) reachedReal = new Set(reachableFromApp(REAL_SRC));
  return reachedReal;
}

export function isUnreachableFamilyEntry(file) {
  const key = String(file)
    .split('\\')
    .join('/')
    .replace(/^src\//, '');
  if (UNREACHABLE_FAMILY_ENTRIES.some((entry) => (entry.endsWith('/') ? key.startsWith(entry) : key === entry))) {
    return true;
  }
  if (!key.startsWith('integrations/family/')) return false;
  if (!existsSync(join(REAL_SRC, key))) return false;
  return !reachedRealFamily().has(key);
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveRelative(fromFile, spec) {
  const clean = spec.split('?')[0];
  if (!clean.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), clean);
  const candidates = [base, ...SOURCE_EXT.flatMap((ext) => [base + ext, join(base, `index${ext}`)])];
  return candidates.find((path) => isFile(path)) ?? null;
}

/** Files imported from the member app, as paths relative to srcRoot. */
export function reachableFromApp(srcRoot, entries = ['main.tsx', 'App.tsx']) {
  const seen = new Set();
  const queue = entries.map((entry) => join(srcRoot, entry));
  while (queue.length) {
    const file = queue.pop();
    if (!file || seen.has(file) || !isFile(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT_RE)) {
      const next = resolveRelative(file, match[1]);
      if (next) queue.push(next);
    }
  }
  return [...seen].map((file) => relative(srcRoot, file).split('\\').join('/'));
}
