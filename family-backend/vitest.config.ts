import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: import.meta.dirname,
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    maxWorkers: 2,
    testTimeout: 15000,
    silent: 'passed-only',
  },
});
