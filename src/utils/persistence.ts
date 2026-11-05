import type { IDBPDatabase } from 'idb';
import type { ZineProject } from '@/types';
import { ASSETS_STORE_NAME, openZineDatabase, PROJECTS_STORE_NAME } from '@/utils/database';
import { collectReferencedAssetIds, migrateProjectAssetCatalog } from '@/utils/projectAssets';
const LAST_PROJECT_ID_KEY = 'lastOpenProjectId';

let db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (db) return db;

  db = await openZineDatabase();
  return db;
}

export async function saveProject(project: ZineProject): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(PROJECTS_STORE_NAME, 'readwrite');

  // Serialize to plain JSON to avoid DataCloneError from proxies or complex instances
  const plain = JSON.parse(JSON.stringify(project, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  }));

  await tx.store.put(plain);
  await tx.done;
  await saveLastOpenProjectId(project.id);
}

export async function loadProject(id: string): Promise<ZineProject | undefined> {
  const db = await getDb();
  const raw: any = await db.get(PROJECTS_STORE_NAME, id);
  if (!raw) return undefined;

  // Revive dates
  raw.createdAt = new Date(raw.createdAt);
  raw.modifiedAt = new Date(raw.modifiedAt);

  if (migrateProjectAssetCatalog(raw)) {
    const tx = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
    await tx.store.put(raw);
    await tx.done;
  }

  return raw as ZineProject;
}

export async function getAllProjects(): Promise<ZineProject[]> {
  const db = await getDb();
  const projects = await db.getAll(PROJECTS_STORE_NAME);

  const projectsToUpdate: any[] = [];

  projects.forEach((p: any) => {
    // Ensure dates are Date objects
    p.createdAt = new Date(p.createdAt);
    p.modifiedAt = new Date(p.modifiedAt);

    if (migrateProjectAssetCatalog(p)) projectsToUpdate.push(p);
  });

  // Save any migrated projects back to database
  if (projectsToUpdate.length > 0) {
    const tx = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
    for (const project of projectsToUpdate) {
      await tx.store.put(project);
    }
    await tx.done;
  }

  return projects;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  const project: ZineProject | undefined = await db.get(PROJECTS_STORE_NAME, id);
  const tx = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
  await tx.store.delete(id);
  await tx.done;

  if (project) {
    const assetIds = [...new Set([...(project.assetIds || []), ...collectReferencedAssetIds(project)])];
    for (const assetId of assetIds) await deleteAssetIfUnreferenced(assetId, id);
  }
}

export async function renameProject(id: string, newName: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
  const project: any = await tx.store.get(id);
  if (!project) return;
  project.name = newName;
  project.modifiedAt = new Date().toISOString();
  await tx.store.put(project);
  await tx.done;
}

export async function deleteAllProjects(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(PROJECTS_STORE_NAME, 'readwrite');
  await tx.store.clear();
  await tx.done;
  const assetTx = db.transaction(ASSETS_STORE_NAME, 'readwrite');
  await assetTx.store.clear();
  await assetTx.done;
}

export async function deleteAssetIfUnreferenced(assetId: number, ignoreProjectId?: string): Promise<boolean> {
  const db = await getDb();
  const projects = await db.getAll(PROJECTS_STORE_NAME) as ZineProject[];
  const isReferenced = projects.some(project => {
    if (project.id === ignoreProjectId) return false;
    return (project.assetIds || []).includes(assetId)
      || collectReferencedAssetIds(project).includes(assetId);
  });
  if (isReferenced) return false;
  await db.delete(ASSETS_STORE_NAME, assetId);
  return true;
}

export async function saveLastOpenProjectId(id: string): Promise<void> {
  localStorage.setItem(LAST_PROJECT_ID_KEY, id);
}

export function getLastOpenProjectId(): string | null {
  return localStorage.getItem(LAST_PROJECT_ID_KEY);
}
