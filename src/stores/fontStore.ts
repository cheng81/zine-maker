import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { IDBPDatabase } from 'idb';
import { FONTS_STORE_NAME, openZineDatabase } from '@/utils/database';

export interface CustomFont {
  id: number;
  family: string;
  source: 'upload' | 'google';
  fileName?: string;
  cssUrl?: string;
}

interface FontSource {
  family: string;
  file: File;
}

interface StoredFont {
  id: number;
  family: string;
  source?: 'upload' | 'google';
  fileName?: string;
  cssUrl?: string;
  file?: File;
}

const SUPPORTED_FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
const MAX_FONT_SIZE = 20 * 1024 * 1024;
const GOOGLE_FONTS_CSS_URL = 'https://fonts.googleapis.com/css2';
const REMOTE_FONT_TIMEOUT = 10_000;

export const useFontStore = defineStore('fonts', () => {
  const fonts = ref<CustomFont[]>([]);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const loadedFaces = new Map<number, FontFace>();
  const loadedStylesheets = new Map<number, HTMLLinkElement>();
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

  async function registerGoogleFont(family: string, cssUrl: string): Promise<HTMLLinkElement> {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    link.dataset.zineGoogleFont = family;

    try {
      await withTimeout(new Promise<void>((resolve, reject) => {
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Google Font "${family}" could not be found.`));
        document.head.appendChild(link);
      }), REMOTE_FONT_TIMEOUT, `Google Font "${family}" took too long to load.`);

      const faces = await withTimeout(
        document.fonts.load(`normal 400 16px ${quoteFontFamily(family)}`, 'BESbswy'),
        REMOTE_FONT_TIMEOUT,
        `Google Font "${family}" took too long to load.`
      );
      if (!faces.length) throw new Error(`Google Font "${family}" could not be found.`);
      return link;
    } catch (error) {
      link.remove();
      throw error;
    }
  }

  async function initialize(force = false): Promise<void> {
    if (initialized && !force) return;

    loading.value = true;
    loadError.value = null;
    try {
      if (force) {
        loadedFaces.forEach(face => document.fonts.delete(face));
        loadedFaces.clear();
        loadedStylesheets.forEach(link => link.remove());
        loadedStylesheets.clear();
      }

      const database = await getDb();
      const records = await database.getAll(FONTS_STORE_NAME) as StoredFont[];
      fonts.value = records
        .map(record => toCustomFont(record))
        .sort((a, b) => a.family.localeCompare(b.family));

      const results = await Promise.allSettled(records.map(async record => {
        if (record.source === 'google' && record.cssUrl) {
          const link = await registerGoogleFont(record.family, record.cssUrl);
          loadedStylesheets.set(record.id, link);
          return;
        }
        if (!record.file) throw new Error(`Saved font "${record.family}" has no font file.`);
        const face = await registerFont({ family: record.family, file: record.file });
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
    const record = { source: 'upload' as const, family, fileName: file.name, file };
    const fontFace = await registerFont(record);
    try {
      const id = await database.add(FONTS_STORE_NAME, record) as number;
      const customFont = { id, source: 'upload' as const, family, fileName: file.name };
      loadedFaces.set(id, fontFace);
      fonts.value = [...fonts.value, customFont].sort((a, b) => a.family.localeCompare(b.family));
      return customFont;
    } catch (error) {
      document.fonts.delete(fontFace);
      throw error;
    }
  }

  async function addGoogleFont(value: string): Promise<CustomFont> {
    await initialize();
    const family = normalizeGoogleFontFamily(value);
    if (!family) throw new Error('Enter a Google Fonts family name.');
    if (!/^[a-zA-Z0-9 ]+$/.test(family)) {
      throw new Error('Use only the family name shown on Google Fonts.');
    }
    if (fonts.value.some(font => font.family.toLowerCase() === family.toLowerCase())) {
      throw new Error(`A font named "${family}" is already loaded.`);
    }

    const cssUrl = googleFontsUrl(family);
    const stylesheet = await registerGoogleFont(family, cssUrl);
    const database = await getDb();
    const record = { source: 'google' as const, family, cssUrl };
    try {
      const id = await database.add(FONTS_STORE_NAME, record) as number;
      const customFont = { id, ...record };
      loadedStylesheets.set(id, stylesheet);
      fonts.value = [...fonts.value, customFont].sort((a, b) => a.family.localeCompare(b.family));
      return customFont;
    } catch (error) {
      stylesheet.remove();
      throw error;
    }
  }

  async function deleteFont(id: number): Promise<void> {
    const database = await getDb();
    await database.delete(FONTS_STORE_NAME, id);
    const face = loadedFaces.get(id);
    if (face) document.fonts.delete(face);
    loadedFaces.delete(id);
    loadedStylesheets.get(id)?.remove();
    loadedStylesheets.delete(id);
    fonts.value = fonts.value.filter(font => font.id !== id);
  }

  return {
    fonts,
    loading,
    loadError,
    initialize,
    addFont,
    addGoogleFont,
    deleteFont,
  };
});

function toCustomFont(record: StoredFont): CustomFont {
  const source = record.source === 'google' ? 'google' : 'upload';
  return {
    id: record.id,
    family: record.family,
    source,
    ...(record.fileName ? { fileName: record.fileName } : {}),
    ...(record.cssUrl ? { cssUrl: record.cssUrl } : {}),
  };
}

function normalizeGoogleFontFamily(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[+_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function googleFontsUrl(family: string): string {
  const url = new URL(GOOGLE_FONTS_CSS_URL);
  url.searchParams.set('family', family);
  url.searchParams.set('display', 'swap');
  return url.toString();
}

function quoteFontFamily(family: string): string {
  return `"${family.replace(/["\\]/g, '\\$&')}"`;
}

function withTimeout<T>(promise: Promise<T>, duration: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), duration);
    promise.then(
      value => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      error => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function fontFamilyFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  return withoutExtension
    .replace(/[_]+/g, ' ')
    .replace(/[^a-zA-Z0-9 -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Custom Font';
}
