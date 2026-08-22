import type { ImageProperties, ZineProject } from '@/types';

export const CURRENT_PROJECT_FORMAT_VERSION = 3;

export function collectReferencedAssetIds(project: Pick<ZineProject, 'pages'>): number[] {
  const ids = new Set<number>();
  project.pages.forEach(page => {
    page.content.forEach(content => {
      if (content.type !== 'image') return;
      const assetId = (content.properties as ImageProperties).assetId;
      if (typeof assetId === 'number') ids.add(assetId);
    });
  });
  return [...ids];
}

export function migrateProjectAssetCatalog(project: ZineProject): boolean {
  const catalogIds = Array.isArray(project.assetIds) ? project.assetIds : [];
  const mergedIds = [...new Set([...catalogIds, ...collectReferencedAssetIds(project)])];
  const changed = (project.formatVersion || 1) < CURRENT_PROJECT_FORMAT_VERSION
    || !Array.isArray(project.assetIds)
    || mergedIds.length !== catalogIds.length;

  project.assetIds = mergedIds;
  if ((project.formatVersion || 1) < CURRENT_PROJECT_FORMAT_VERSION) {
    project.formatVersion = CURRENT_PROJECT_FORMAT_VERSION;
  }
  return changed;
}

export function getAssetUsageCount(project: Pick<ZineProject, 'pages'>, assetId: number): number {
  return project.pages.reduce((count, page) => (
    count + page.content.filter(content => (
      content.type === 'image' && (content.properties as ImageProperties).assetId === assetId
    )).length
  ), 0);
}
