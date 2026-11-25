import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TranslationProvider, useTranslation } from '../../i18n/TranslationContext';
import { useSettingsStore } from '../../store/settingsStore';
import {
  TranslationProvider as LegacyProvider,
  useTranslation as useLegacyTranslation,
} from './legacy/i18n/TranslationContext';
import { useSettingsStore as useLegacySettings } from './legacy/store/settingsStore';
import * as familyRuntime from './runtime';

const missingFrench = vi.hoisted(() => new Error('Fixture locale chunk is unavailable'));
vi.mock('@family/shared-compat/i18n/fr', () => {
  throw missingFrench;
});

const familyKey = 'dashboard.confirm.copy.family.will1';
const nativeSettings = useSettingsStore.getState().settings;
const legacySettings = useLegacySettings.getState().settings;
const loaded = { timeout: 5000 };
const documentLanguage = document.documentElement.lang;
const documentDirection = document.documentElement.dir;

afterEach(() => {
  cleanup();
  document.documentElement.lang = documentLanguage;
  document.documentElement.dir = documentDirection;
  useSettingsStore.setState({ settings: nativeSettings });
  useLegacySettings.setState({ settings: legacySettings });
  vi.restoreAllMocks();
});

function NativeLabels() {
  const { t } = useTranslation();
  return (
    <>
      <div data-testid="native-label">{t('common.save')}</div>
      <div data-testid="family-label">{t(familyKey)}</div>
    </>
  );
}

function LegacyLabel() {
  return <div data-testid="legacy-label">{useLegacyTranslation().t('common.save')}</div>;
}

it('uses English Family labels when the active TREK language has no Family translation', async () => {
  vi.spyOn(familyRuntime, 'isFamilyFrontendActive').mockReturnValue(true);
  useSettingsStore.setState({ settings: { ...nativeSettings, language: 'de' } });
  render(
    <TranslationProvider>
      <NativeLabels />
    </TranslationProvider>
  );
  expect(await screen.findByText('Daten, Titelbild und Notizen', {}, loaded)).toBeTruthy();
  expect(screen.getByTestId('native-label').textContent).toBe('Speichern');

  act(() => useSettingsStore.setState({ settings: { ...nativeSettings, language: 'he' } }));
  await waitFor(() => expect(screen.getByTestId('native-label').textContent).toBe('שמירה'), loaded);
  expect(screen.getByTestId('family-label').textContent).toBe('Dates, cover image & notes');
});

it('keeps the last legacy translation when its next locale fails to load and can recover to English', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  useLegacySettings.setState({ settings: { ...legacySettings, language: 'de' } });
  render(
    <LegacyProvider>
      <LegacyLabel />
    </LegacyProvider>
  );
  expect(await screen.findByText('Speichern', {}, loaded)).toBeTruthy();

  act(() => useLegacySettings.setState({ settings: { ...legacySettings, language: 'fr' } }));
  await waitFor(
    () => expect(log).toHaveBeenCalledWith('[i18n] locale chunk failed to load', expect.any(Error)),
    loaded
  );
  expect(screen.getByTestId('legacy-label').textContent).toBe('Speichern');

  act(() => useLegacySettings.setState({ settings: { ...legacySettings, language: 'en' } }));
  expect(await screen.findByText('Save', {}, loaded)).toBeTruthy();
});

it('treats an inherited property name as an unsupported locale in both providers', () => {
  useSettingsStore.setState({ settings: { ...nativeSettings, language: 'constructor' } });
  useLegacySettings.setState({ settings: { ...legacySettings, language: 'constructor' } });
  render(
    <>
      <TranslationProvider>
        <NativeLabels />
      </TranslationProvider>
      <LegacyProvider>
        <LegacyLabel />
      </LegacyProvider>
    </>
  );
  expect(screen.getByTestId('native-label').textContent).toBe('Save');
  expect(screen.getByTestId('legacy-label').textContent).toBe('Save');
});
