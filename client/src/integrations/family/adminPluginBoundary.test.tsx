import { describe, expect, it } from 'vitest';
import { isAdminSurfaceVisible } from './legacy/pages/admin/adminSurfaces';

describe('retained admin plugin panel — profile and unchanged consumers', () => {
  it.each([false, true])('keeps Family plugins hidden with dev mode %s', (devMode) => {
    expect(isAdminSurfaceVisible('plugins', { supabasePlane: true, mcpEnabled: true, devMode })).toBe(false);
  });
  it('retains the alternative-profile entry without admitting Family plugins', () => {
    expect(isAdminSurfaceVisible('plugins', { supabasePlane: false, mcpEnabled: false, devMode: false })).toBe(true);
  });
});
