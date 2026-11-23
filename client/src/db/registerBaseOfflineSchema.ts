import type Dexie from 'dexie';

// Keep the shipped base versions in registration order for both databases.
export function registerBaseOfflineSchema(db: Dexie): void {
  db.version(1).stores({
    trips: 'id',
    days: 'id, trip_id',
    places: 'id, trip_id',
    packingItems: 'id, trip_id',
    todoItems: 'id, trip_id',
    budgetItems: 'id, trip_id',
    reservations: 'id, trip_id',
    tripFiles: 'id, trip_id',
    mutationQueue: 'id, tripId, status, createdAt',
    syncMeta: 'tripId',
    blobCache: 'url, cachedAt',
  });

  db.version(2).stores({
    accommodations: 'id, trip_id',
    tripMembers: '[tripId+id], tripId',
    tags: 'id',
    categories: 'id',
  });

  // v3: scope the blob cache by trip so it can be evicted with the trip and
  // bounded by an LRU budget (see enforceBlobBudget).
  db.version(3)
    .stores({
      blobCache: 'url, cachedAt, tripId',
    })
    .upgrade(async (tx) => {
      await tx
        .table('blobCache')
        .toCollection()
        .modify((row: { tripId?: number; bytes?: number; blob?: Pick<Blob, 'size'> }) => {
          if (row.tripId == null) row.tripId = -1;
          if (row.bytes == null) row.bytes = row.blob?.size ?? 0;
        });
    });

  // v4: durable store for booking-import source files (survives a reload mid-parse).
  db.version(4).stores({
    importFiles: '[jobId+fileName], jobId, createdAt',
  });
}
