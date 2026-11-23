import { afterEach, expect, it, vi } from 'vitest';
import {
  coherentStayQualificationEnabled,
  nativeStayCommandQualificationEnabled,
  nativeStayWriteQualificationEnabled,
} from './coherentStayQualification';
const env = vi.hoisted(() => ({ source: 'http://127.0.0.1:57171' }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => env.source }));
afterEach(() => vi.unstubAllEnvs());
it('enables only the explicit original-native local command/read qualification', () => {
  env.source = 'http://127.0.0.1:57171';
  vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
  expect(nativeStayCommandQualificationEnabled()).toBe(true);
  expect(coherentStayQualificationEnabled()).toBe(true);
  expect(nativeStayWriteQualificationEnabled()).toBe(false);
});
it.each([
  'https://hosted.supabase.invalid',
  'http://localhost:57171',
  'http://127.0.0.1:57171/',
  'http://127.0.0.1:56671',
])('refuses native command qualification at %s', (url) => {
  env.source = url;
  vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
  expect(nativeStayCommandQualificationEnabled()).toBe(false);
});
it.each(['', 'true', 'local-existing-v1'])('does not enable a native command from flag %s', (flag) => {
  env.source = 'http://127.0.0.1:57171';
  vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', flag);
  expect(nativeStayCommandQualificationEnabled()).toBe(false);
});
it('preserves the older explicit C4 read/existing-write qualification', () => {
  env.source = 'http://127.0.0.1:56671';
  vi.stubEnv('VITE_FAMILY_STAY_READ_QUALIFICATION', 'local-v4');
  vi.stubEnv('VITE_FAMILY_STAY_WRITE_QUALIFICATION', 'local-existing-v1');
  expect(coherentStayQualificationEnabled()).toBe(true);
  expect(nativeStayWriteQualificationEnabled()).toBe(true);
  expect(nativeStayCommandQualificationEnabled()).toBe(false);
});
