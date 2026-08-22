import { openDB, type IDBPDatabase } from 'idb';

export const DB_NAME = 'ZineMakerDB';
export const DB_VERSION = 3;
export const ASSETS_STORE_NAME = 'assets';
export const PROJECTS_STORE_NAME = 'projects';
export const FONTS_STORE_NAME = 'fonts';

export function openZineDatabase(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1 && !database.objectStoreNames.contains(ASSETS_STORE_NAME)) {
        database.createObjectStore(ASSETS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      if (oldVersion < 2 && !database.objectStoreNames.contains(PROJECTS_STORE_NAME)) {
        database.createObjectStore(PROJECTS_STORE_NAME, { keyPath: 'id' });
      }
      if (oldVersion < 3 && !database.objectStoreNames.contains(FONTS_STORE_NAME)) {
        database.createObjectStore(FONTS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}
