import { z } from 'zod';
import { FamilyApiError } from './errors';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';

const copyRequest = z.object({ operation_id: z.string().uuid(), title: z.string().trim().min(1) });
const copyReceipt = z.object({ trip_id: z.string().uuid(), proposal_id: z.string().uuid() });

export async function copyFamilyTripWithReceipt(sourceTripId: string, body: unknown) {
  const request = copyRequest.safeParse(body);
  if (!request.success) throw new FamilyApiError(422, 'family_trip_copy_request', 'Choose a title and a copy operation.');
  const { data, error } = await getSupabaseBrowserClient().rpc('copy_family_trip_v1', {
    p_source_trip_id: sourceTripId,
    p_operation_id: request.data.operation_id,
    p_title: request.data.title,
  });
  if (error) {
    if (error.code === 'PGRST202')
      throw new FamilyApiError(501, 'family_trip_copy_unavailable', 'Copy Trip is unavailable in this Family release.');
    if (error.code === '42501')
      throw new FamilyApiError(403, 'family_trip_copy_forbidden', 'This trip cannot be copied with your Family permissions.');
    if (error.code === 'PT409' || error.code === '0A000' || error.code === '22023')
      throw new FamilyApiError(409, 'family_trip_copy_conflict', error.message);
    throw error;
  }
  const receipt = copyReceipt.safeParse(data);
  if (!receipt.success) throw new Error('The trip copy returned an incomplete receipt.');
  return receipt.data;
}
