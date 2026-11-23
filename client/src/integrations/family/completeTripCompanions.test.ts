import { describe, expect, it, vi } from 'vitest';
import { readCountedRows } from './completeTripCompanions';
const key = (r: unknown) => String((r as { id: number }).id);
const fence = async () => {};
describe('canonical companion completeness', () => {
  it('traverses a server cap smaller than its requested page size', async () => {
    const page = vi.fn(async (from: number) => ({ data: [{ id: from }], error: null, count: 3 }));
    expect(await readCountedRows(page, key, fence)).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }]);
    expect(page.mock.calls.map((c) => c[0])).toEqual([0, 1, 2]);
  });
  it('accepts exact empty success', async () => {
    expect(await readCountedRows(async () => ({ data: [], error: null, count: 0 }), key, fence)).toEqual([]);
  });
  it.each([
    { data: [], error: null, count: null },
    { data: [], error: null, count: 1 },
    { data: [{ id: 1 }], error: null, count: 0 },
    { data: null, error: null, count: 0 },
    { data: [], error: { status: 403 }, count: 0 },
    { data: [], error: null, count: 10001 },
  ])('refuses absent, truncated, refused or unbounded lists %#', async (response) => {
    await expect(readCountedRows(async () => response, key, fence)).rejects.toBeDefined();
  });
  it('rejects duplicates and a changing total across pages', async () => {
    await expect(
      readCountedRows(async () => ({ data: [{ id: 1 }], error: null, count: 2 }), key, fence)
    ).rejects.toThrow('Duplicate');
    let n = 0;
    await expect(
      readCountedRows(async () => ({ data: [{ id: ++n }], error: null, count: n === 1 ? 2 : 3 }), key, fence)
    ).rejects.toThrow('Incomplete');
  });
  it('checks the original scope after each delayed page', async () => {
    let changed = false;
    const check = async () => {
      if (changed) throw new Error('Original actor ended');
    };
    await expect(
      readCountedRows(
        async () => {
          changed = true;
          return { data: [], error: null, count: 0 };
        },
        key,
        check
      )
    ).rejects.toThrow('Original actor ended');
  });
});
