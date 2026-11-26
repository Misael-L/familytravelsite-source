import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
export async function listTripCurrencies(): Promise<string[]> {
  const { data, error } = await getSupabaseBrowserClient().from('currencies').select('code').order('code');
  if (error) throw error;
  const codes = (data ?? []).map((row: { code: string }) => row.code.trim());
  if (!codes.length || codes.some((code: string) => !/^[A-Z]{3}$/.test(code)))
    throw new Error('Could not load trip currencies. Try again.');
  return codes;
}
