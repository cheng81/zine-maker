import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { IDBPDatabase } from 'idb';
import { ASSETS_STORE_NAME, openZineDatabase } from '@/utils/database';

export interface ImageAssetRecord {
  id: number;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  createdAt: string;
}

export interface AssetUploadFailure {
  fileName: string;
  reason: string;
}

const MAX_IMAGE_SIZE = 25 * 1024 * 1024;

export const useAssetStore = defineStore('assets', () => {
  const db = ref<IDBPDatabase | null>(null);

  async function initDB() {
    if (db.value) return;

    db.value = await openZineDatabase();
  }

  async function addAsset(file: File): Promise<number | undefined> {
    const result = await addAssets([file]);
    return result.assets[0]?.id;
  }

  async function addAssets(files: File[]): Promise<{ assets: ImageAssetRecord[]; failures: AssetUploadFailure[] }> {
    if (!db.value) await initDB();
    if (!db.value) return { assets: [], failures: [] };

    const assets: ImageAssetRecord[] = [];
    const failures: AssetUploadFailure[] = [];
    for (const file of files) {
      try {
        if (file.type && !file.type.startsWith('image/')) throw new Error('Not an image file');
        if (file.size > MAX_IMAGE_SIZE) throw new Error('Larger than 25 MB');
        const dimensions = await readImageDimensions(file);
        const record = {
          file,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          width: dimensions.width,
          height: dimensions.height,
          createdAt: new Date().toISOString(),
        };
        const id = await db.value.add(ASSETS_STORE_NAME, record) as number;
        assets.push({ id, ...record });
      } catch (error) {
        failures.push({
          fileName: file.name,
          reason: error instanceof Error ? error.message : 'Could not read image',
        });
      }
    }
    return { assets, failures };
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

  async function getAssetRecord(id: number): Promise<ImageAssetRecord | undefined> {
    if (!db.value) await initDB();
    const stored = await db.value?.get(ASSETS_STORE_NAME, id);
    if (!stored?.file) return undefined;
    if (!stored.width || !stored.height) {
      const dimensions = await readImageDimensions(stored.file);
      stored.width = dimensions.width;
      stored.height = dimensions.height;
      stored.name = stored.name || stored.file.name;
      stored.mimeType = stored.mimeType || stored.file.type;
      stored.size = stored.size || stored.file.size;
      stored.createdAt = stored.createdAt || new Date(0).toISOString();
      await db.value?.put(ASSETS_STORE_NAME, { ...stored, id });
    }
    return normalizeAssetRecord(id, stored);
  }

  async function getAssetRecords(ids: number[]): Promise<ImageAssetRecord[]> {
    const records = await Promise.all(ids.map(async id => {
      try {
        return await getAssetRecord(id);
      } catch {
        return undefined;
      }
    }));
    return records.filter((record): record is ImageAssetRecord => Boolean(record));
  }

  async function deleteAsset(id: number): Promise<void> {
    if (!db.value) await initDB();
    await db.value?.delete(ASSETS_STORE_NAME, id);
  }

  return {
    initDB,
    addAsset,
    addAssets,
    getAsset,
    getAssetRecord,
    getAssetRecords,
    deleteAsset,
  };
});

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('Image has invalid dimensions'));
        return;
      }
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unsupported or unreadable image'));
    };
    image.src = url;
  });
}

function normalizeAssetRecord(id: number, stored: any): ImageAssetRecord {
  return {
    id,
    file: stored.file,
    name: stored.name || stored.file.name || `Image ${id}`,
    mimeType: stored.mimeType || stored.file.type || 'application/octet-stream',
    size: stored.size || stored.file.size || 0,
    width: stored.width || 300,
    height: stored.height || 300,
    createdAt: stored.createdAt || new Date(0).toISOString(),
  };
}
