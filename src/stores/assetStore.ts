import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { IDBPDatabase } from 'idb';
import { ASSETS_STORE_NAME, openZineDatabase } from '@/utils/database';

export const useAssetStore = defineStore('assets', () => {
  const db = ref<IDBPDatabase | null>(null);

  async function initDB() {
    if (db.value) return;

    db.value = await openZineDatabase();
  }

  async function addAsset(file: File): Promise<number | undefined> {
    if (!db.value) await initDB();
    if (!db.value) return;

    const tx = db.value.transaction(ASSETS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(ASSETS_STORE_NAME);
    const id = await store.add({ file });
    await tx.done;
    return id as number;
  }

  async function getAsset(id: number): Promise<File | undefined> {
    if (!db.value) await initDB();
    if (!db.value) return;

    const tx = db.value.transaction(ASSETS_STORE_NAME, 'readonly');
    const store = tx.objectStore(ASSETS_STORE_NAME);
    const asset = await store.get(id);
    await tx.done;
    return asset?.file;
  }

  return {
    initDB,
    addAsset,
    getAsset,
  };
});
