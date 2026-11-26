import Dexie, { type Table } from 'dexie';

export interface BaseOfflineRows {
  trips: unknown;
  days: unknown;
  places: unknown;
  packingItems: unknown;
  todoItems: unknown;
  budgetItems: unknown;
  reservations: unknown;
  tripFiles: unknown;
  accommodations: unknown;
  tripMembers: unknown;
  tags: unknown;
  categories: unknown;
  mutationQueue: unknown;
  syncMeta: unknown;
  blobCache: unknown;
  importFiles: unknown;
}

/** The common table fields. Each concrete database registers its own versions and guards. */
export abstract class BaseOfflineDb<Rows extends BaseOfflineRows> extends Dexie {
  trips!: Table<Rows['trips'], number>;
  days!: Table<Rows['days'], number>;
  places!: Table<Rows['places'], number>;
  packingItems!: Table<Rows['packingItems'], number>;
  todoItems!: Table<Rows['todoItems'], number>;
  budgetItems!: Table<Rows['budgetItems'], number>;
  reservations!: Table<Rows['reservations'], number>;
  tripFiles!: Table<Rows['tripFiles'], number>;
  accommodations!: Table<Rows['accommodations'], number>;
  tripMembers!: Table<Rows['tripMembers'], [number, number]>;
  tags!: Table<Rows['tags'], number>;
  categories!: Table<Rows['categories'], number>;
  mutationQueue!: Table<Rows['mutationQueue'], string>;
  syncMeta!: Table<Rows['syncMeta'], number>;
  blobCache!: Table<Rows['blobCache'], string>;
  importFiles!: Table<Rows['importFiles'], [string, string]>;
}
