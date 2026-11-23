import type { SupportedLanguageCode } from '@family/shared-compat';
import type { TranslationStrings } from '@family/shared-compat/i18n';
import familyEnglish from '@family/shared-compat/i18n/en';

export { familyEnglish };

type FamilyLocaleLoader = () => Promise<{ default: TranslationStrings }>;

// One explicit dynamic import per locale — Vite code-splits a separate chunk per locale.
// Each non-English locale is loaded on demand; en is always available synchronously as the fallback.
const localeLoaders: Record<SupportedLanguageCode, FamilyLocaleLoader> = {
  en: () => Promise.resolve({ default: familyEnglish }),
  de: () => import('@family/shared-compat/i18n/de'),
  es: () => import('@family/shared-compat/i18n/es'),
  fr: () => import('@family/shared-compat/i18n/fr'),
  hu: () => import('@family/shared-compat/i18n/hu'),
  it: () => import('@family/shared-compat/i18n/it'),
  tr: () => import('@family/shared-compat/i18n/tr'),
  ru: () => import('@family/shared-compat/i18n/ru'),
  zh: () => import('@family/shared-compat/i18n/zh'),
  'zh-TW': () => import('@family/shared-compat/i18n/zh-TW'),
  nl: () => import('@family/shared-compat/i18n/nl'),
  id: () => import('@family/shared-compat/i18n/id'),
  ar: () => import('@family/shared-compat/i18n/ar'),
  br: () => import('@family/shared-compat/i18n/br'),
  cs: () => import('@family/shared-compat/i18n/cs'),
  pl: () => import('@family/shared-compat/i18n/pl'),
  ja: () => import('@family/shared-compat/i18n/ja'),
  ko: () => import('@family/shared-compat/i18n/ko'),
  uk: () => import('@family/shared-compat/i18n/uk'),
  gr: () => import('@family/shared-compat/i18n/gr'),
  sv: () => import('@family/shared-compat/i18n/sv'),
  vi: () => import('@family/shared-compat/i18n/vi'),
  ca: () => import('@family/shared-compat/i18n/ca'),
};

export function getFamilyLocaleLoader(language: string): FamilyLocaleLoader | undefined {
  if (!Object.prototype.hasOwnProperty.call(localeLoaders, language)) return undefined;
  return localeLoaders[language as SupportedLanguageCode];
}
