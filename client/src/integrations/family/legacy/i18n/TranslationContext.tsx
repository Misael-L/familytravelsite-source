import {
  SUPPORTED_LANGUAGES,
  escapeHtml,
  getIntlLanguage,
  getLocaleForLanguage,
  isRtlLanguage,
  sanitizeInlineHtml,
} from '@family/shared-compat';
import type { TranslationStrings } from '@family/shared-compat/i18n';
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { familyEnglish as en, getFamilyLocaleLoader } from '../../../../i18n/familyLocaleLoaders';
import { matchBrowserLanguage } from '../../../../i18n/matchBrowserLanguage';
import { useSettingsStore } from '../store/settingsStore';

export { SUPPORTED_LANGUAGES };

// Re-export pure helpers that live in shared so downstream consumers can import them
// through this module without changing their import path.
export { getIntlLanguage, getLocaleForLanguage, isRtlLanguage };

export function detectBrowserLanguage(): string | null {
  return matchBrowserLanguage(SUPPORTED_LANGUAGES);
}

interface TranslationContextValue {
  t: (key: string, params?: Record<string, string | number>) => string;
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
  tHtml: (key: string, params?: Record<string, string | number>) => string;
  language: string;
  locale: string;
}

const TranslationContext = createContext<TranslationContextValue>({
  t: (k: string) => k,
  tHtml: (k: string) => k,
  language: 'en',
  locale: 'en-US',
});

interface TranslationProviderProps {
  children: ReactNode;
}

export function TranslationProvider({ children }: TranslationProviderProps) {
  const language = useSettingsStore((s) => s.settings.language) || 'en';
  const [strings, setStrings] = useState<TranslationStrings>(en);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtlLanguage(language) ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    const loader = getFamilyLocaleLoader(language);
    if (!loader) return;

    let cancelled = false;
    void loader()
      .then((mod) => {
        if (!cancelled) setStrings(mod.default);
      })
      .catch((err) => {
        if (!cancelled) console.error('[i18n] locale chunk failed to load', err);
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const value = useMemo((): TranslationContextValue => {
    function t(key: string, params?: Record<string, string | number>): string {
      let val: string = (strings[key] ?? en[key] ?? key) as string;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
      }
      return val;
    }

    function tHtml(key: string, params?: Record<string, string | number>): string {
      let val: string = (strings[key] ?? en[key] ?? key) as string;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          // Escape BEFORE substitution so a user-controlled value with `<` or
          // `&` cannot break out of the surrounding template's markup.
          val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), escapeHtml(String(v)));
        });
      }
      // Then re-sanitise the fully-built string: even if a translator ships a
      // template with stray `<script>` or `onclick`, the rendered output is
      // restricted to the inline tag allow-list.
      return sanitizeInlineHtml(val);
    }

    return { t, tHtml, language, locale: getLocaleForLanguage(language) };
  }, [strings, language]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation(): TranslationContextValue {
  return useContext(TranslationContext);
}
