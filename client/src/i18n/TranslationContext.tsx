import { isFamilyFrontendActive } from '../integrations/family/runtime'
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import en from '@trek/shared/i18n/en'
import type { SupportedLanguageCode } from '@trek/shared'
import {
  SUPPORTED_LANGUAGES,
  getLocaleForLanguage,
  getIntlLanguage,
  isRtlLanguage,
  escapeHtml,
} from '@trek/shared'
import { sanitizeInlineHtml } from '@trek/shared/sanitize'
import type { TranslationStrings } from '@trek/shared/i18n'
import { importChunk } from '../utils/chunkReload'
import { familyEnglish, getFamilyLocaleLoader } from './familyLocaleLoaders'
import { resolveTemplate } from './resolveTemplate'

export { SUPPORTED_LANGUAGES }

// One explicit dynamic import per locale — Vite code-splits a separate chunk per locale.
// Only the active locale is fetched; en is always available synchronously as the fallback.
const localeLoaders: Record<SupportedLanguageCode, () => Promise<{ default: TranslationStrings }>> = {
  en:      () => Promise.resolve({ default: en }),
  de:      () => import('@trek/shared/i18n/de'),
  es:      () => import('@trek/shared/i18n/es'),
  et:      () => import('@trek/shared/i18n/et'),
  fr:      () => import('@trek/shared/i18n/fr'),
  hu:      () => import('@trek/shared/i18n/hu'),
  it:      () => import('@trek/shared/i18n/it'),
  tr:      () => import('@trek/shared/i18n/tr'),
  ru:      () => import('@trek/shared/i18n/ru'),
  zh:      () => import('@trek/shared/i18n/zh'),
  'zh-TW': () => import('@trek/shared/i18n/zh-TW'),
  nl:      () => import('@trek/shared/i18n/nl'),
  id:      () => import('@trek/shared/i18n/id'),
  ar:      () => import('@trek/shared/i18n/ar'),
  az:      () => import('@trek/shared/i18n/az'),
  he:      () => import('@trek/shared/i18n/he'),
  br:      () => import('@trek/shared/i18n/br'),
  cs:      () => import('@trek/shared/i18n/cs'),
  sk:      () => import('@trek/shared/i18n/sk'),
  pl:      () => import('@trek/shared/i18n/pl'),
  ja:      () => import('@trek/shared/i18n/ja'),
  ko:      () => import('@trek/shared/i18n/ko'),
  th:      () => import('@trek/shared/i18n/th'),
  uk:      () => import('@trek/shared/i18n/uk'),
  gr:      () => import('@trek/shared/i18n/gr'),
  sv:      () => import('@trek/shared/i18n/sv'),
  vi:      () => import('@trek/shared/i18n/vi'),
  ca:      () => import('@trek/shared/i18n/ca'),
}

function familyStrings(raw: Record<string, unknown>): TranslationStrings {
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

const familyEnglishStrings = familyStrings(familyEnglish)

type LocaleCatalogue = { language: string; strings: TranslationStrings }

// Re-export pure helpers that live in shared so downstream consumers can import them
// through this module without changing their import path.
export { getLocaleForLanguage, getIntlLanguage, isRtlLanguage }

export { detectBrowserLanguage } from './detectBrowserLanguage'

interface TranslationContextValue {
  t: (key: string, params?: Record<string, string | number>) => string
  /**
   * HTML-aware variant of `t()`. Use ONLY when the translated template
   * legitimately contains markup (e.g. `'Turn <strong>{title}</strong> into a Journey'`).
   *
   * Defence in depth, two layers:
   *   1. Every interpolated param is HTML-escaped before substitution, so a
   *      user-controlled value like `<script>` cannot inject markup at all.
   *   2. The fully-substituted string is then passed through
   *      `sanitizeInlineHtml`, so even if a translator ships a malformed
   *      template the runtime output is still tag-restricted.
   *
   * Prefer the `<TransHtml>` component for the typical "translate + render"
   * pattern; reach for `tHtml()` directly only when you need the raw string
   * (e.g. constructing an `aria-label`).
   */
  tHtml: (key: string, params?: Record<string, string | number>) => string
  language: string
  locale: string
}

const TranslationContext = createContext<TranslationContextValue>({
  t: (k: string) => k,
  tHtml: (k: string) => k,
  language: 'en',
  locale: 'en-US',
})

interface TranslationProviderProps {
  children: ReactNode
}

export function TranslationProvider({ children }: TranslationProviderProps) {
  const language = useSettingsStore((s) => s.settings.language) || 'en'
  // The catalogue together with the language it belongs to: while another
  // language loads, or when its chunk fails, the strings on screen are still
  // the previous ones, and their plural forms follow that language's rule.
  const [familyCatalogue, setFamilyCatalogue] = useState<LocaleCatalogue>()
  const [catalogue, setCatalogue] = useState<LocaleCatalogue>({ language: 'en', strings: en })
  useEffect(() => {
    if (!isFamilyFrontendActive() || language === 'en') return
    const loader = getFamilyLocaleLoader(language)
    if (!loader) return

    let cancelled = false
    void loader().then(module => {
      if (!cancelled) setFamilyCatalogue({ language, strings: familyStrings(module.default) })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [language])

  useEffect(() => {
    document.documentElement.lang = getIntlLanguage(language)
    document.documentElement.dir = isRtlLanguage(language) ? 'rtl' : 'ltr'
  }, [language])

  useEffect(() => {
    if (!Object.prototype.hasOwnProperty.call(localeLoaders, language)) return
    const loader = localeLoaders[language as SupportedLanguageCode]

    let cancelled = false
    importChunk(loader).then(mod => {
      // The same table for the same language keeps the state, and with it t():
      // English arrives as the very table the provider started with.
      if (!cancelled) {
        setCatalogue(prev => (prev.language === language && prev.strings === mod.default ? prev : { language, strings: mod.default }))
      }
    }).catch(err => {
      // The locale chunk can be gone after a deploy. Keep the strings we have —
      // an untranslated UI beats an unhandled rejection and a blank screen.
      console.error('[i18n] locale chunk failed to load', err)
    })
    return () => { cancelled = true }
  }, [language])

  const value = useMemo((): TranslationContextValue => {
    const intlLanguage = getIntlLanguage(catalogue.language)
    const familyMessages = familyCatalogue?.language === catalogue.language ? familyCatalogue.strings : undefined
    const messages = isFamilyFrontendActive()
      ? { ...familyEnglishStrings, ...familyMessages, ...catalogue.strings }
      : catalogue.strings
    const template = (key: string, params?: Record<string, string | number>): string =>
      resolveTemplate(messages, intlLanguage, key, params)

    function t(key: string, params?: Record<string, string | number>): string {
      let val = template(key, params)
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          // Function replacement: a value carrying `$&` or `$1` (a trip named
          // "A$&B") would otherwise be expanded as a replacement pattern.
          val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), () => String(v))
        })
      }
      return val
    }

    function tHtml(key: string, params?: Record<string, string | number>): string {
      let val = template(key, params)
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          // Escape BEFORE substitution so a user-controlled value with `<` or
          // `&` cannot break out of the surrounding template's markup.
          val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), () => escapeHtml(String(v)))
        })
      }
      // Then re-sanitise the fully-built string: even if a translator ships a
      // template with stray `<script>` or `onclick`, the rendered output is
      // restricted to the inline tag allow-list.
      return sanitizeInlineHtml(val)
    }

    return { t, tHtml, language, locale: getLocaleForLanguage(language) }
  }, [catalogue, familyCatalogue, language])

  return <TranslationContext value={value}>{children}</TranslationContext>
}

export function useTranslation(): TranslationContextValue {
  return useContext(TranslationContext)
}
