import { z } from 'zod';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';

const id = z.string().uuid(),
  text = z.string().nullable();
const money = z.union([z.number().finite(), z.string().regex(/^-?\d+(?:\.\d+)?$/)]);
const date = z.string().date(),
  stamp = z.string().datetime({ offset: true });
export const completeTripHeader = z
  .object({
    id,
    family_id: id,
    title: z.string(),
    description: text,
    start_date: date.nullable(),
    end_date: date.nullable(),
    cover_image: text,
    is_archived: z.union([z.literal(0), z.literal(1)]),
    currency: z.string(),
    reminder_days: z.number().int().nullable(),
    status: z.string(),
  })
  .strict();
const expense = z
  .object({
    id,
    trip_id: id,
    name: z.string(),
    category: z.string(),
    total_amount: money,
    currency_code: text,
    exchange_rate: money.nullable(),
    expense_date: date.nullable(),
    note: text,
    ticket_lines: z.unknown(),
    reservation_id: id.nullable(),
    sort_order: z.number().int().nullable(),
    created_at: stamp,
  })
  .strict();
const share = z.object({ expense_id: id, person_id: id, amount: money.nullable() }).strict();
const payer = share.extend({ amount: money });
const file = z
  .object({
    id,
    trip_id: id,
    storage_path: z.string().min(1),
    original_name: z.string(),
    mime_type: text,
    size_bytes: z.number().int().nonnegative().safe(),
    uploaded_by: id.nullable(),
    starred: z.boolean(),
    description: text,
    deleted_at: z.null(),
    created_at: stamp,
  })
  .strict();
const link = z
  .object({
    id,
    trip_id: id,
    file_id: id,
    place_id: id.nullable(),
    reservation_id: id.nullable(),
    trip_day_id: id.nullable(),
  })
  .strict();
const person = z.object({ display_name: z.string().min(1), color: text }).strict();
const member = z.object({ person_id: id, people: z.union([person, z.array(person).length(1)]) }).strict();
const category = z
  .object({
    id,
    family_id: id,
    name: z.string(),
    color_hex: z.string(),
    icon_key: z.string(),
    sort_order: z.number().int(),
  })
  .strict();
export const completeTripCompanions = z
  .object({
    expenses: z.array(expense).max(10000),
    shares: z.array(share).max(10000),
    payers: z.array(payer).max(10000),
    files: z.array(file).max(10000),
    links: z.array(link).max(10000),
    members: z.array(member).max(10000),
    categories: z.array(category).max(10000),
    tags: z.tuple([]),
  })
  .strict();
export type CompleteTripCompanions = z.infer<typeof completeTripCompanions>;
export type CountedPage = { data: unknown; error: unknown; count: number | null };
/** A short page is not end-of-list evidence: server row caps can be smaller than our page size. */
export async function readCountedRows(
  page: (from: number, to: number) => PromiseLike<CountedPage>,
  key: (row: unknown) => string,
  fence: () => Promise<void>
): Promise<unknown[]> {
  const rows: unknown[] = [],
    seen = new Set<string>();
  let total: number | null = null;
  do {
    await fence();
    const result = await page(rows.length, rows.length + 99);
    await fence();
    if (result.error) throw result.error;
    if (
      !Number.isSafeInteger(result.count) ||
      result.count === null ||
      result.count < 0 ||
      result.count > 10000 ||
      (total !== null && total !== result.count) ||
      !Array.isArray(result.data)
    )
      throw new Error('Incomplete Trip list');
    total = result.count;
    if (
      result.data.length > 100 ||
      rows.length + result.data.length > total ||
      (!result.data.length && rows.length < total)
    )
      throw new Error('Truncated Trip list');
    for (const row of result.data) {
      const identity = key(row);
      if (!identity || seen.has(identity)) throw new Error('Duplicate Trip list identity');
      seen.add(identity);
      rows.push(row);
    }
  } while (rows.length < total);
  return rows;
}
const rowKey = (schema: z.ZodType, keys: string[]) => (raw: unknown) => {
  const row = schema.parse(raw) as Record<string, unknown>;
  return JSON.stringify(keys.map((key) => row[key]));
};
/** Fresh exact-count queries under the existing SDK/RLS. No service key, signed URLs or native projections. */
export async function readCompleteTripCompanions(trip: string, family: string, fence: () => Promise<void>) {
  const sb = getSupabaseBrowserClient();
  const read = async (table: string, columns: string, schema: z.ZodType, filter: [string, string], keys = ['id']) =>
    readCountedRows(
      (from, to) => {
        let query = sb
          .from(table)
          .select(columns, { count: 'exact' })
          .eq(...filter);
        for (const key of keys) query = query.order(key, { ascending: true });
        if (table === 'trip_files') query = query.is('deleted_at', null);
        if (table === 'trip_travelers') query = query.not('person_id', 'is', null);
        return query.range(from, to);
      },
      rowKey(schema, keys),
      fence
    );
  const [expenses, files, links, members, categories] = await Promise.all([
    read(
      'trip_expenses',
      'id,trip_id,name,category,total_amount,currency_code,exchange_rate,expense_date,note,ticket_lines,reservation_id,sort_order,created_at',
      expense,
      ['trip_id', trip]
    ),
    read(
      'trip_files',
      'id,trip_id,storage_path,original_name,mime_type,size_bytes,uploaded_by,starred,description,deleted_at,created_at',
      file,
      ['trip_id', trip]
    ),
    read('trip_file_links', 'id,trip_id,file_id,place_id,reservation_id,trip_day_id', link, ['trip_id', trip]),
    read('trip_travelers', 'person_id,people(display_name,color)', member, ['trip_id', trip], ['person_id']),
    read('family_place_categories', 'id,family_id,name,color_hex,icon_key,sort_order', category, ['family_id', family]),
  ]);
  const [shares, payers] = await Promise.all(
    ['trip_expense_shares', 'trip_expense_payers'].map(async (table) => {
      const result: unknown[] = [];
      for (let start = 0; start < expenses.length; start += 100) {
        const ids = expenses.slice(start, start + 100).map((row) => expense.parse(row).id);
        result.push(
          ...(await readCountedRows(
            (from, to) =>
              sb
                .from(table)
                .select('expense_id,person_id,amount', { count: 'exact' })
                .in('expense_id', ids)
                .order('expense_id')
                .order('person_id')
                .range(from, to),
            rowKey(table.endsWith('shares') ? share : payer, ['expense_id', 'person_id']),
            fence
          ))
        );
        if (result.length > 10000) throw new Error('Trip expense links exceed bound');
      }
      return result;
    })
  );
  // Links for trashed files are not active workspace resources. Retain exact active-file links only.
  const active = new Set(files.map((row) => file.parse(row).id));
  return completeTripCompanions.parse({
    expenses,
    shares,
    payers,
    files,
    links: links.filter((row) => active.has(link.parse(row).file_id)),
    members,
    categories,
    tags: [],
  });
}
