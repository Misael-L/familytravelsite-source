import { describe, expect, it, vi } from 'vitest';

vi.mock('./legacy/data/supabase/env', () => ({
  getDataPlane: () => 'nest',
  getSupabaseUrl: () => 'http://127.0.0.1',
  getSupabaseAnonKey: () => 'anon',
}));

import { apiClient } from '../../api/client';
import { installFamilyFrontend } from './bootstrap';

describe('installFamilyFrontend', () => {
  it('does not replace the API adapter when the data plane is nest', () => {
    const before = apiClient.defaults.adapter;
    installFamilyFrontend();
    expect(apiClient.defaults.adapter).toBe(before);
  });
});
