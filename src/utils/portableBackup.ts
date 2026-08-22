import {
  ASSETS_STORE_NAME,
  FONTS_STORE_NAME,
  openZineDatabase,
  PROJECTS_STORE_NAME,
} from '@/utils/database';
import { collectReferencedAssetIds, migrateProjectAssetCatalog } from '@/utils/projectAssets';

export async function exportAll(): Promise<any> {
  const db = await openZineDatabase();
  const projects = await db.getAll(PROJECTS_STORE_NAME);
  const assets = await db.getAll(ASSETS_STORE_NAME);
  const fonts = await db.getAll(FONTS_STORE_NAME);
  return {
    projects,
    assets: await Promise.all(assets.map(serializeStoredFile)),
    fonts: await Promise.all(fonts.map(serializeStoredFile)),
  };
}

export async function importAll(payload: any): Promise<void> {
  const db = await openZineDatabase();
  const txP = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
  // Clear existing stores? We will append to avoid destructive overwrite
  const projects = Array.isArray(payload?.projects) ? payload.projects : [];
  const assets = Array.isArray(payload?.assets) ? payload.assets : [];
  const fonts = Array.isArray(payload?.fonts) ? payload.fonts : [];
  for (const p of projects) {
    await (txP.store as any).put(p);
  }
  await txP.done;

  const txA = db.transaction(ASSETS_STORE_NAME, 'readwrite');
  for (const a of assets) {
    await (txA.store as any).put(deserializeStoredFile(a, 'asset'));
  }
  await txA.done;

  const txF = db.transaction(FONTS_STORE_NAME, 'readwrite');
  for (const font of fonts) {
    await (txF.store as any).put(deserializeStoredFile(font, 'font'));
  }
  await txF.done;
}

// Export a single project and only the assets it uses
export async function exportProjectById(projectId: string): Promise<any> {
  const db = await openZineDatabase();
  const project: any = await db.get(PROJECTS_STORE_NAME, projectId);
  if (!project) throw new Error('Project not found');

  const assetIds = new Set<number>([
    ...(Array.isArray(project.assetIds) ? project.assetIds : []),
    ...collectReferencedAssetIds(project),
  ]);

  const assets: any[] = [];
  for (const id of assetIds) {
    const a: any = await db.get(ASSETS_STORE_NAME, id);
    if (!a) continue;
    assets.push(await serializeStoredFile(a));
  }

  const fontFamilies = new Set<string>();
  (project.pages || []).forEach((page: any) => {
    (page.content || []).forEach((content: any) => {
      if (content?.type === 'text' && typeof content?.properties?.fontFamily === 'string') {
        fontFamilies.add(content.properties.fontFamily);
      }
    });
  });
  const storedFonts = await db.getAll(FONTS_STORE_NAME);
  const fonts = await Promise.all(
    storedFonts
      .filter((font: any) => fontFamilies.has(font.family))
      .map(serializeStoredFile)
  );

  return { project, assets, fonts };
}

// Import a single project (and optional serialized assets)
export async function importProject(payload: any): Promise<void> {
  const db = await openZineDatabase();
  const project = JSON.parse(JSON.stringify(payload.project));
  migrateProjectAssetCatalog(project);
  const idMap = new Map<number, number>();

  {
    const txA = db.transaction(ASSETS_STORE_NAME, 'readwrite');
    for (const a of Array.isArray(payload.assets) ? payload.assets : []) {
      const record = deserializeStoredFile(a, 'asset');
      const oldId = record.id;
      delete record.id;
      const newId = await (txA.store as any).add(record) as number;
      if (typeof oldId === 'number') idMap.set(oldId, newId);
    }
    for (const oldId of project.assetIds || []) {
      if (idMap.has(oldId)) continue;
      const newId = await (txA.store as any).add({ missing: true, originalAssetId: oldId }) as number;
      idMap.set(oldId, newId);
    }
    await txA.done;
  }

  project.assetIds = (project.assetIds || []).map((id: number) => idMap.get(id) ?? id);
  (project.pages || []).forEach((page: any) => {
    (page.content || []).forEach((content: any) => {
      const oldId = content?.properties?.assetId;
      if (content?.type === 'image' && typeof oldId === 'number' && idMap.has(oldId)) {
        content.properties.assetId = idMap.get(oldId);
      }
    });
  });

  const txP = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
  await (txP.store as any).put(project);
  await txP.done;

  if (Array.isArray(payload.fonts) && payload.fonts.length) {
    const txF = db.transaction(FONTS_STORE_NAME, 'readwrite');
    for (const font of payload.fonts) {
      await (txF.store as any).put(deserializeStoredFile(font, 'font'));
    }
    await txF.done;
  }
}

async function serializeStoredFile(record: any): Promise<any> {
  const file: File | undefined = record?.file;
  if (!file) return record;
  return {
    ...record,
    file: { name: file.name, type: file.type, dataUrl: await fileToBase64(file) },
  };
}

function deserializeStoredFile(record: any, fallbackName: string): any {
  const serializedFile = record?.file;
  if (!serializedFile?.dataUrl) return record;
  return {
    ...record,
    file: dataUrlToFile(serializedFile.dataUrl, serializedFile.name || fallbackName),
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}
