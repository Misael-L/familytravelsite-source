import { describe, expect, it } from 'vitest';
import { nativeDatabaseUser, sourceDatabaseName, unattributedDatabaseName } from './nativeDatabaseNames';
describe('device database names are locators only', () => {
  it.each([
    'trek-offline',
    'trek-offline-u0',
    'trek-offline-u01',
    'trek-offline-u-1',
    'trek-offline-u1.5',
    'trek-offline-u9007199254740992',
    'trek-offline-u1-extra',
    'other-u1',
  ])('refuses %s as unattributed input', (name) => expect(unattributedDatabaseName(name)).toBe(false));
  it('distinguishes source-owned/legacy names while preserving public parser semantics', () => {
    const owned = 'trek-offline-f1-' + 'a'.repeat(64) + '-u17';
    expect(sourceDatabaseName(owned)).toBe(true);
    expect(unattributedDatabaseName(owned)).toBe(false);
    expect(nativeDatabaseUser(owned)).toBe(17);
    expect(nativeDatabaseUser('trek-offline-u17')).toBe(17);
    expect(unattributedDatabaseName('trek-offline-u17')).toBe(true);
  });
});
