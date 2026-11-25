import { describe, expect, it } from 'vitest';
import {
  deviceRecoveryQualified,
  hostedDeviceRecoveryBuildQualified,
  hostedDeviceRecoveryOriginQualified,
} from './deviceRecoveryGate';
describe('unattributed recovery remains explicit local qualification', () => {
  it.each(['http://127.0.0.1:55331', 'http://localhost:55331'])('accepts only qualified source %s', (source) =>
    expect(deviceRecoveryQualified('supabase', 'local-v1', source)).toBe(true)
  );
  it.each([
    'https://project.supabase.invalid',
    'http://127.0.0.1:55331/',
    'http://127.0.0.1:55332',
    'http://localhost:55331?enable=1',
    undefined,
  ])('refuses source %s', (source) => expect(deviceRecoveryQualified('supabase', 'local-v1', source)).toBe(false));
  it('refuses ordinary and other data planes', () => {
    expect(deviceRecoveryQualified('supabase', '', 'http://127.0.0.1:55331')).toBe(false);
    expect(deviceRecoveryQualified('trek', 'local-v1', 'http://127.0.0.1:55331')).toBe(false);
  });
});

describe('hosted device recovery', () => {
  it.each([
    'https://familytravelsite.lmisael0721.workers.dev',
    'https://familytravelsite-integration-preview.lmisael0721.workers.dev',
  ])('accepts the exact original deployment origin %s', (origin) => {
    expect(hostedDeviceRecoveryOriginQualified(origin)).toBe(true);
    expect(hostedDeviceRecoveryOriginQualified(origin + '/')).toBe(false);
    expect(hostedDeviceRecoveryOriginQualified(origin.replace('https:', 'http:'))).toBe(false);
    expect(hostedDeviceRecoveryOriginQualified(origin + '.example.com')).toBe(false);
    expect(hostedDeviceRecoveryOriginQualified(origin + ':8443')).toBe(false);
  });

  it('requires the primary backend and fallback build', () => {
    expect(hostedDeviceRecoveryOriginQualified(undefined)).toBe(false);
    expect(hostedDeviceRecoveryOriginQualified('http://127.0.0.1:55331')).toBe(false);
    expect(
      hostedDeviceRecoveryBuildQualified({
        VITE_DATA_PLANE: 'supabase',
        VITE_SUPABASE_URL: 'https://other-project.supabase.invalid',
        VITE_FAMILY_CORE_WRITER_PROFILE: 'primary-core-fallback-v1',
      })
    ).toBe(false);
  });
});
