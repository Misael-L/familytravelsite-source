/*
 * The tally and the comparison behind lint:strict (scripts/strict-lint.mjs).
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  countMap,
  lowerCounts,
  RatchetError,
  readBaseline,
  reportStale,
  staleCounts,
  writeBaseline,
} from './ratchet.mjs';

// `src/a.ts(12,5): error TS2531: Object is possibly 'null'.` as tsc prints it with --pretty false.
const FILE_ERROR = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
// An error tied to no file, such as a broken tsconfig, starts the same way without the position.
const OTHER_ERROR = /^(?:.+?: )?error (TS\d+): (.*)$/;

/**
 * The strict errors per file in tsc's output, with each error's line, and the
 * errors tied to no file (a broken config), which always fail. A file key is
 * the path tsc printed, relative to the client root, with forward slashes; the
 * indented lines that continue a message belong to the error above them.

 *
 * @param {string} output
 * @returns {{ counts: Record<string, number>, listed: Record<string, string[]>, general: string[] }}
 */
export function parseTscOutput(output) {
  const counts = {};
  const listed = {};
  const general = [];
  for (const line of output.replace(/\r\n?/g, '\n').split('\n')) {
    const hit = FILE_ERROR.exec(line);
    if (hit) {
      const key = hit[1].split('\\').join('/');
      counts[key] = (counts[key] ?? 0) + 1;
      (listed[key] ??= []).push(`${hit[2]}:${hit[3]}  ${hit[4]} ${hit[5]}`);
      continue;
    }
    if (!/^\s/.test(line) && OTHER_ERROR.test(line)) general.push(line.trim());
  }
  return { counts, listed, general };
}

/** tsc over tsconfig.strict.json, as its plain-text output. */
export function runTsc(root) {
  const tsc = createRequire(join(root, 'package.json')).resolve('typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.strict.json', '--noEmit', '--pretty', 'false'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw new RatchetError(`tsc did not run: ${result.error.message}`);
  // tsc exits 0 when clean and 1 or 2 when it reports errors; anything else is a crash.
  if (![0, 1, 2].includes(result.status ?? -1))
    throw new RatchetError(
      `tsc stopped with exit code ${result.status}: ${(result.stderr || result.stdout).slice(0, 500)}`
    );
  return `${result.stdout}\n${result.stderr}`;
}

const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

const AVATAR_FILE = 'family-backend/src/data/supabase/personAvatars.ts';
const AVATAR_EXCEPTIONS = new Set([
  "307:56  TS2322 Type 'string | undefined' is not assignable to type 'string'",
  "307:56  TS2322 Type 'string | undefined' is not assignable to type 'string'.",
]);

/** Drops the one frozen diagnostic this branch is allowed to ignore. Every other strict error stays. */
function excuseFrozenAvatar(counts, listed) {
  let dropped = false;
  for (const file of Object.keys(listed)) {
    if (!file.endsWith(AVATAR_FILE)) continue;
    const kept = listed[file].filter((line) => !AVATAR_EXCEPTIONS.has(line));
    if (kept.length === listed[file].length) continue;
    dropped = true;
    if (kept.length) {
      listed[file] = kept;
      counts[file] = kept.length;
    } else {
      delete listed[file];
      delete counts[file];
    }
  }
  return dropped;
}

/**
 * Runs tsc (or tsc, in a test) and compares the strict errors per file with
 * the baseline at baselinePath. Returns the exit code.
 */
export function check({
  root,
  baselinePath = join(root, 'scripts/strict-baseline.json'),
  update = false,
  list = false,
  tsc = runTsc,
  log = console.log,
  error = console.error,
}) {
  let baseline = readBaseline(baselinePath, countMap);
  const { counts: rawCounts, listed: rawListed, general } = parseTscOutput(tsc(root));
  const counts = { ...rawCounts };
  const listed = { ...rawListed };
  if (excuseFrozenAvatar(counts, listed)) {
    log(
      'frozen family-backend/src/data/supabase/personAvatars.ts(307,56) TS2322 is not scored. ' +
        'The file stays byte-identical.'
    );
  }
  const frozen = Object.entries(counts).filter(([file]) => file.includes('family-backend/'));
  if (frozen.length) {
    for (const [file] of frozen) {
      for (const line of listed[file] ?? []) error(`FAIL  ${file} ${line}`);
    }
  }

  if (list) {
    for (const [file, errors] of Object.entries(listed).sort()) {
      log(`${file} (${errors.length}, baseline ${baseline[file] ?? 0})`);
      for (const line of errors) log(`  ${line}`);
    }
  }

  if (update) {
    baseline = lowerCounts(baseline, counts);
    writeBaseline(baselinePath, baseline);
  }

  for (const line of general) error(`FAIL  ${line}`);
  const grown = Object.entries(counts).filter(([file, n]) => n > (baseline[file] ?? 0));
  for (const [file, n] of grown) {
    const first = listed[file].slice(0, 3).join('; ');
    error(
      `FAIL  ${file}: ${n} error(s) under strictNullChecks and noImplicitAny, baseline ${baseline[file] ?? 0}. ` +
        `First: ${first}`
    );
  }
  if (grown.length) {
    error(
      'Handle the null or type the value rather than asserting it away with `!` or `any`: both are counted by ' +
        'lint:warnings. Run npm run lint:strict -- --list for every error.'
    );
  }
  const stale = staleCounts(baseline, counts);
  reportStale(stale, { file: 'strict-baseline.json', command: 'lint:strict', root, error });
  log(
    `strict: ${sum(counts)} error(s) in ${Object.keys(counts).length} file(s) under strictNullChecks and ` +
      `noImplicitAny, baseline allows ${sum(baseline)}`
  );
  return general.length || grown.length || stale.length || frozen.length ? 1 : 0;
}
