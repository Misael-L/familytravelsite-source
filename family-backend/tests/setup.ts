import { beforeEach, vi } from 'vitest';

// These are local fixtures. Adapter tests must never contact a real project.
function installFixtures() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://family-carryover.invalid');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-fixture');
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('Network access is disabled in Family backend carryover tests.');
  }));
}

installFixtures();
beforeEach(installFixtures);
