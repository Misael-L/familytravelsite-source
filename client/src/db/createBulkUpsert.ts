import type { BaseOfflineDb, BaseOfflineRows } from './baseOfflineDb';

/** Resolve the table when the write starts so each caller uses its own active database. */
function createBulkUpsert<Row>(
  getTable: () => { bulkPut(rows: Row[]): PromiseLike<unknown> }
): (rows: Row[]) => Promise<void> {
  return async (rows) => {
    await getTable().bulkPut(rows);
  };
}

export function createTripCacheUpserts<Rows extends BaseOfflineRows>(getDatabase: () => BaseOfflineDb<Rows>) {
  return {
    upsertDays: createBulkUpsert<Rows['days']>(() => getDatabase().days),
    upsertPackingItems: createBulkUpsert<Rows['packingItems']>(() => getDatabase().packingItems),
    upsertTodoItems: createBulkUpsert<Rows['todoItems']>(() => getDatabase().todoItems),
    upsertBudgetItems: createBulkUpsert<Rows['budgetItems']>(() => getDatabase().budgetItems),
    upsertReservations: createBulkUpsert<Rows['reservations']>(() => getDatabase().reservations),
    upsertTripFiles: createBulkUpsert<Rows['tripFiles']>(() => getDatabase().tripFiles),
    upsertAccommodations: createBulkUpsert<Rows['accommodations']>(() => getDatabase().accommodations),
  };
}
