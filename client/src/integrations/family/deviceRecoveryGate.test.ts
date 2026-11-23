import { describe, expect, it } from 'vitest';
import { deviceRecoveryQualified } from './deviceRecoveryGate';
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
