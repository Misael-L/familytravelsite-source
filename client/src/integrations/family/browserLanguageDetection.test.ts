import { afterEach, expect, it, vi } from 'vitest';
import { detectBrowserLanguage as detectNative } from '../../i18n/detectBrowserLanguage';
import { detectBrowserLanguage as detectLegacy } from './legacy/i18n/TranslationContext';

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([
  { preferences: ['zH-tW', 'zh'], expected: 'zh-TW' },
  { preferences: ['de-AT', 'fr'], expected: 'de' },
  { preferences: ['pt-PT', 'pt-bR', 'en'], expected: 'br' },
  { preferences: ['pt-PT', 'pt'], expected: null },
  { preferences: ['xx-ZZ', 'fr-CA'], expected: 'fr' },
])('matches $preferences in order in both catalogs', ({ preferences, expected }) => {
  vi.stubGlobal('navigator', { languages: preferences, language: 'es' });
  expect(detectNative()).toBe(expected);
  expect(detectLegacy()).toBe(expected);
});

it.each([
  ['et-EE', 'et'],
  ['sk-SK', 'sk'],
  ['az-AZ', 'az'],
  ['he-IL', 'he'],
  ['th-TH', 'th'],
])('selects %s natively and keeps looking in the legacy catalog', (locale, code) => {
  vi.stubGlobal('navigator', { languages: [locale, 'es-MX'], language: 'en' });
  expect(detectNative()).toBe(code);
  expect(detectLegacy()).toBe('es');
});

it.each([
  { name: 'empty', languages: [] },
  { name: 'missing', languages: undefined },
])('checks the single locale when the preference list is $name', ({ languages }) => {
  vi.stubGlobal('navigator', { languages, language: 'fr-CA' });
  expect(detectNative()).toBe('fr');
  expect(detectLegacy()).toBe('fr');
});

it.each([
  { name: 'the browser has no language data', browser: { languages: [], language: '' } },
  { name: 'there is no navigator', browser: undefined },
])('returns no match when $name', ({ browser }) => {
  vi.stubGlobal('navigator', browser);
  expect(detectNative()).toBeNull();
  expect(detectLegacy()).toBeNull();
});
