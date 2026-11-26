import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFamilyOriginalWork } from './familyOriginalWorkExport';
const io = vi.hoisted(() => ({ active: true, legacy: vi.fn(async () => {}), archive: vi.fn(async () => {}) }));
vi.mock('./runtime', () => ({ isFamilyFrontendActive: () => io.active }));
vi.mock('../../sync/retainedRecovery', () => ({ downloadRetainedWork: io.legacy }));
vi.mock('../../sync/originalWorkExport', () => ({ downloadOriginalWork: io.archive }));
afterEach(() => {
  vi.unstubAllEnvs();
  io.legacy.mockClear();
  io.archive.mockClear();
});
describe('original-work export activation boundary', () => {
  it.each([
    { label: 'ordinary build', flag: '', source: 'http://127.0.0.1:55331', active: true, archive: false },
    { label: 'inactive Family', flag: 'local-v1', source: 'http://127.0.0.1:55331', active: false, archive: false },
    {
      label: 'hosted source',
      flag: 'local-v1',
      source: 'https://example.supabase.invalid',
      active: true,
      archive: false,
    },
    { label: 'unpinned alias', flag: 'local-v1', source: 'http://localhost:55331', active: true, archive: false },
    {
      label: 'explicit marked-loopback qualification',
      flag: 'local-v1',
      source: 'http://127.0.0.1:55331',
      active: true,
      archive: true,
    },
  ])('keeps $label on its qualified exporter', async (c) => {
    io.active = c.active;
    vi.stubEnv('VITE_FAMILY_OFFLINE_READ_QUALIFICATION', c.flag);
    vi.stubEnv('VITE_SUPABASE_URL', c.source);
    await downloadFamilyOriginalWork();
    expect(io.archive).toHaveBeenCalledTimes(c.archive ? 1 : 0);
    expect(io.legacy).toHaveBeenCalledTimes(c.archive ? 0 : 1);
  });
});
