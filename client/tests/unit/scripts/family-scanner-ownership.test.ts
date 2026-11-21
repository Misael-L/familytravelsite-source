import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluate } from '../../../scripts/i18n-keys.mjs';
import {
  isUnreachableFamilyEntry,
  reachableFromApp,
  UNREACHABLE_FAMILY_ENTRIES,
} from '../../../scripts/lib/family-scanner-ownership.mjs';
import { scan as scanRtl } from '../../../scripts/lib/rtl.mjs';
import { scan as scanTheme } from '../../../scripts/lib/theme.mjs';

const SRC = join(process.cwd(), 'src');
let temp: string | null = null;

afterEach(() => {
  if (temp) rmSync(temp, { recursive: true, force: true });
  temp = null;
});

describe('family scanner ownership', () => {
  it('does not exclude a file the member app can import', () => {
    const reached = new Set(reachableFromApp(SRC));
    expect(reached.has('main.tsx')).toBe(true);
    expect(reached.has('App.tsx')).toBe(true);
    const excludedAndReached = [...reached].filter((file) => isUnreachableFamilyEntry(file));
    expect(excludedAndReached).toEqual([]);
    expect(UNREACHABLE_FAMILY_ENTRIES.length).toBeGreaterThan(0);
    expect(isUnreachableFamilyEntry('integrations/family/legacy/App.tsx')).toBe(true);
    for (const page of ['pages/VacayPage.tsx', 'mobile/screens/vacay/MVacay.tsx']) {
      expect(reached.has(page)).toBe(true);
      expect(isUnreachableFamilyEntry(page)).toBe(false);
    }
    expect(isUnreachableFamilyEntry('integrations/family/legacy/pages/FamilyFrontendController.tsx')).toBe(false);
    expect(isUnreachableFamilyEntry('integrations/family/activeProbe.tsx')).toBe(false);
  });

  it('reports an active Family file and skips an unreachable host', () => {
    temp = mkdtempSync(join(tmpdir(), 'family-scan-'));
    const src = join(temp, 'src');
    mkdirSync(join(src, 'integrations/family/legacy/pages'), { recursive: true });
    writeFileSync(
      join(src, 'integrations/family/activeProbe.tsx'),
      `export const probe = () => <div className="ml-2 bg-gray-100" />\n`
    );
    writeFileSync(
      join(src, 'integrations/family/legacy/App.tsx'),
      `export const unused = () => <div className="ml-2 bg-gray-100" />\n`
    );
    writeFileSync(join(src, 'keep.ts'), 'export const keep = 1\n');

    const rtl = scanRtl(temp);
    const theme = scanTheme(temp);
    const hits = (counts: object, file: string) => {
      const value = Object.getOwnPropertyDescriptor(counts, file)?.value;
      return typeof value === 'number' ? value : 0;
    };
    expect(hits(rtl.counts, 'integrations/family/activeProbe.tsx')).toBeGreaterThan(0);
    expect(hits(theme.counts, 'integrations/family/activeProbe.tsx')).toBeGreaterThan(0);
    expect(hits(rtl.counts, 'integrations/family/legacy/App.tsx')).toBe(0);
    expect(hits(theme.counts, 'integrations/family/legacy/App.tsx')).toBe(0);

    const scan = {
      literal: [
        { file: 'pages/AtlasPage.tsx', line: 1, key: 'settings.toast.nestOnly' },
        {
          file: 'integrations/family/legacy/pages/FamilyFrontendController.tsx',
          line: 2,
          key: 'settings.toast.nestOnly',
        },
        { file: 'integrations/family/activeProbe.tsx', line: 3, key: 'family.probe.missing' },
        { file: 'integrations/family/legacy/App.tsx', line: 4, key: 'family.probe.missing' },
      ],
      dynamic: [],
    };
    const missing = evaluate(
      scan,
      new Set(['common.ok']),
      [],
      { literal: [], dynamic: [] },
      new Set(['settings.toast.nestOnly'])
    ).missing;
    expect(missing.map((item: { file: string }) => item.file)).toEqual(['integrations/family/activeProbe.tsx']);
  });

  it('uses the Family catalog for Family code and the merged catalogs for native code', () => {
    const trek = new Set(['trek.only.one']);
    const family = new Set(['family.only.one']);
    const scan = {
      literal: [
        { file: 'integrations/family/activeProbe.tsx', line: 1, key: 'trek.only.one' },
        { file: 'pages/AtlasPage.tsx', line: 1, key: 'family.only.one' },
        { file: 'integrations/family/activeProbe.tsx', line: 2, key: 'family.only.one' },
        { file: 'pages/AtlasPage.tsx', line: 2, key: 'missing.from.both' },
      ],
      dynamic: [
        {
          file: 'integrations/family/activeProbe.tsx',
          line: 3,
          template: 'family.only.${name}',
          pattern: /^family\.only\.[^.]+$/,
        },
        { file: 'pages/AtlasPage.tsx', line: 3, template: 'family.only.${name}', pattern: /^family\.only\.[^.]+$/ },
        {
          file: 'integrations/family/activeProbe.tsx',
          line: 4,
          template: 'trek.only.${name}',
          pattern: /^trek\.only\.[^.]+$/,
        },
      ],
    };
    const verdict = evaluate(scan, trek, [], { literal: [], dynamic: [] }, family);
    expect(verdict.missing.map((item: { key: string; file: string }) => `${item.file}:${item.key}`)).toEqual([
      'integrations/family/activeProbe.tsx:trek.only.one',
      'pages/AtlasPage.tsx:missing.from.both',
    ]);
    expect(
      verdict.unmatched.map((item: { file: string; template: string }) => `${item.file}:${item.template}`)
    ).toEqual(['integrations/family/activeProbe.tsx:trek.only.${name}']);
    expect(verdict.unused).toEqual(['trek.only.one']);
  });
});
