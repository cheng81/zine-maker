import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { IDBPDatabase } from 'idb';
import { FONTS_STORE_NAME, openZineDatabase } from '@/utils/database';

export interface CustomFont {
  id: number;
  family: string;
  fileName: string;
}

interface FontSource {
  family: string;
  file: File;
}

type StoredFont = CustomFont & FontSource;

const SUPPORTED_FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
const MAX_FONT_SIZE = 20 * 1024 * 1024;

export const useFontStore = defineStore('fonts', () => {
  const fonts = ref<CustomFont[]>([]);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const loadedFaces = new Map<number, FontFace>();
  let db: IDBPDatabase | null = null;
  let initialized = false;

  async function getDb(): Promise<IDBPDatabase> {
    if (!db) db = await openZineDatabase();
    return db;
  }

  async function registerFont(record: FontSource): Promise<FontFace> {
    const fontFace = new FontFace(record.family, await record.file.arrayBuffer());
    await fontFace.load();
    document.fonts.add(fontFace);
    return fontFace;
  }

  async function initialize(force = false): Promise<void> {
    if (initialized && !force) return;

    loading.value = true;
    loadError.value = null;
    try {
      if (force) {
        loadedFaces.forEach(face => document.fonts.delete(face));
        loadedFaces.clear();
      }

      const database = await getDb();
      const records = await database.getAll(FONTS_STORE_NAME) as StoredFont[];
      fonts.value = records
        .map(({ id, family, fileName }) => ({ id, family, fileName }))
        .sort((a, b) => a.family.localeCompare(b.family));

      const results = await Promise.allSettled(records.map(async record => {
        const face = await registerFont(record);
        loadedFaces.set(record.id, face);
      }));
      const failedCount = results.filter(result => result.status === 'rejected').length;
      if (failedCount) loadError.value = `${failedCount} saved font${failedCount === 1 ? '' : 's'} could not be loaded.`;
      initialized = true;
    } finally {
      loading.value = false;
    }
  }

  async function addFont(file: File): Promise<CustomFont> {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!SUPPORTED_FONT_EXTENSIONS.includes(extension)) {
      throw new Error('Choose a TTF, OTF, WOFF, or WOFF2 font file.');
    }
    if (file.size > MAX_FONT_SIZE) {
      throw new Error('Font files must be 20 MB or smaller.');
    }

    await initialize();
    const family = fontFamilyFromFileName(file.name);
    if (fonts.value.some(font => font.family.toLowerCase() === family.toLowerCase())) {
      throw new Error(`A font named "${family}" is already loaded.`);
    }

    const database = await getDb();
    const record = { family, fileName: file.name, file };
    const fontFace = await registerFont(record);
    try {
      const id = await database.add(FONTS_STORE_NAME, record) as number;
      const customFont = { id, family, fileName: file.name };
      loadedFaces.set(id, fontFace);
      fonts.value = [...fonts.value, customFont].sort((a, b) => a.family.localeCompare(b.family));
      return customFont;
    } catch (error) {
      document.fonts.delete(fontFace);
      throw error;
    }
  }

  async function deleteFont(id: number): Promise<void> {
    const database = await getDb();
    await database.delete(FONTS_STORE_NAME, id);
    const face = loadedFaces.get(id);
    if (face) document.fonts.delete(face);
    loadedFaces.delete(id);
    fonts.value = fonts.value.filter(font => font.id !== id);
  }

  return {
    fonts,
    loading,
    loadError,
    initialize,
    addFont,
    deleteFont,
  };
});

function fontFamilyFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  return withoutExtension
    .replace(/[_]+/g, ' ')
    .replace(/[^a-zA-Z0-9 -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Custom Font';
}
