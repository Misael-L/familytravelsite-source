import { SUPPORTED_LANGUAGES } from '@trek/shared';
import { matchBrowserLanguage } from './matchBrowserLanguage';

// Its own module so the settings store can run it at startup without importing
// the translation context, which imports the store.

export function detectBrowserLanguage(): string | null {
  return matchBrowserLanguage(SUPPORTED_LANGUAGES);
}
