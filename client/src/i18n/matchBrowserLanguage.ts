// Detects the user's preferred language from browser/OS settings.
// Returns null if no supported language matches.
export function matchBrowserLanguage(catalog: readonly { value: string }[]): string | null {
  if (typeof navigator === 'undefined') return null;
  const browserLangs = navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : [];
  const supported = catalog.map((l) => l.value);

  for (const lang of browserLangs) {
    const exactMatch = supported.find((s) => s.toLowerCase() === lang.toLowerCase());
    if (exactMatch) return exactMatch;

    // pt-BR has no exact match (our code is 'br'), so map it explicitly.
    // pt-PT and bare 'pt' are NOT mapped — they fall through to null.
    if (lang.toLowerCase() === 'pt-br' && supported.includes('br')) return 'br';

    const prefix = lang.split('-')[0]?.toLowerCase();
    const prefixMatch = supported.find((s) => s.toLowerCase() === prefix);
    if (prefixMatch) return prefixMatch;
  }

  return null;
}
