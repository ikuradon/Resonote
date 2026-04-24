import { AuftaktDexieDatabase } from './schema.js';

export const AUFTAKT_DEXIE_ADAPTER_VERSION = 1;

export interface CreateDexieEventStoreOptions {
  readonly dbName: string;
}

export class DexieEventStore {
  constructor(readonly db: AuftaktDexieDatabase) {}

  tableNames(): string[] {
    return this.db.tables.map((table) => table.name);
  }
}

export async function createDexieEventStore(
  options: CreateDexieEventStoreOptions
): Promise<DexieEventStore> {
  const db = new AuftaktDexieDatabase(options.dbName);
  await db.open();
  return new DexieEventStore(db);
}

export * from './schema.js';
