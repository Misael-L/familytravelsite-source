import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFamilyTripWithReceipt } from './tripCopyReceipt';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => mock }));

const source = '10000000-0000-4000-8000-000000000001';
const operation = '10000000-0000-4000-8000-000000000002';
const receipt = {
  trip_id: '10000000-0000-4000-8000-000000000003',
  proposal_id: '10000000-0000-4000-8000-000000000004',
};
const body = { operation_id: operation, title: 'Mexico (copy)' };

beforeEach(() => {
  mock.rpc.mockResolvedValue({ data: receipt, error: null });
});
afterEach(() => {
  mock.rpc.mockReset();
});

describe('Family receipt-backed trip copy', () => {
  it('sends the captured operation and source to Supabase', async () => {
    await expect(copyFamilyTripWithReceipt(source, body)).resolves.toEqual(receipt);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('copy_family_trip_v1', {
      p_source_trip_id: source,
      p_operation_id: operation,
      p_title: body.title,
    });
  });

  it('requires an operation ID and a complete receipt', async () => {
    await expect(copyFamilyTripWithReceipt(source, { title: body.title })).rejects.toMatchObject({ status: 422 });
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.rpc.mockResolvedValue({ data: { trip_id: receipt.trip_id }, error: null });
    await expect(copyFamilyTripWithReceipt(source, body)).rejects.toThrow('incomplete receipt');
  });
});
