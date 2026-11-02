import type { ImageProperties, NormalizedImageCrop, ZineContent, ZinePage, ZineProject } from '@/types';
import { isValidImageCrop } from '@/utils/imageCrop';

export interface SpreadMember {
  page: ZinePage;
  content: ZineContent;
  properties: ImageProperties;
}

export function isSpreadImage(content: ZineContent | null | undefined): boolean {
  return content?.type === 'image' && Boolean((content.properties as ImageProperties).spreadId);
}

export function findSpreadMembers(project: ZineProject, spreadId: string): SpreadMember[] {
  if (!spreadId) return [];
  return project.pages.flatMap(page => page.content.flatMap(content => {
    const properties = content.properties as ImageProperties;
    return content.type === 'image' && properties.spreadId === spreadId
      ? [{ page, content, properties }] : [];
  }));
}

export function pageHasSpread(page: ZinePage): boolean {
  return page.content.some(content => content.type === 'image'
    && Boolean((content.properties as ImageProperties).spreadId));
}

export function getSpreadPageSize(project: ZineProject, page: ZinePage) {
  const size = project.template.pageCanvas
    || project.template.printLayout.pagePositions.find(position => position.pageNumber === page.pageNumber)
    || project.template.printLayout.pagePositions[0];
  return size && [size.width, size.height].every(value => Number.isFinite(value) && value > 0)
    ? { width: size.width, height: size.height } : null;
}

/** Centered cover composition over two equal pages, split without pixel rounding. */
export function createSpreadCrops(sourceWidth: number, sourceHeight: number, pageWidth: number, pageHeight: number):
  { left: NormalizedImageCrop; right: NormalizedImageCrop } | null {
  if (![sourceWidth, sourceHeight, pageWidth, pageHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const ratio = (2 * pageWidth / pageHeight) / (sourceWidth / sourceHeight);
  const width = Math.min(1, ratio);
  const height = Math.min(1, 1 / ratio);
  const x = (1 - width) / 2;
  const y = (1 - height) / 2;
  const halfWidth = width / 2;
  return {
    left: { x, y, width: halfWidth, height },
    right: { x: x + halfWidth, y, width: halfWidth, height },
  };
}

/** A valid pair follows logical page order, regardless of print imposition. */
export function getValidSpread(project: ZineProject, spreadId: string):
  { left: SpreadMember; right: SpreadMember } | null {
  const members = findSpreadMembers(project, spreadId);
  if (members.length !== 2) return null;
  const left = members.find(member => member.properties.spreadSide === 'left');
  const right = members.find(member => member.properties.spreadSide === 'right');
  if (!left || !right || project.pages.indexOf(right.page) !== project.pages.indexOf(left.page) + 1) return null;
  const a = getSpreadPageSize(project, left.page);
  const b = getSpreadPageSize(project, right.page);
  if (!a || !b || a.width !== b.width || a.height !== b.height) return null;
  if (left.properties.assetId !== right.properties.assetId || left.properties.src !== right.properties.src) return null;
  for (const member of members) {
    if (member.page.content.filter(content => content.type === 'image'
      && Boolean((content.properties as ImageProperties).spreadId)).length !== 1) return null;
    const c = member.content;
    if (c.x !== 0 || c.y !== 0 || c.width !== a.width || c.height !== a.height || c.rotation !== 0) return null;
  }
  const l = left.properties.crop;
  const r = right.properties.crop;
  if (!isValidImageCrop(l) || !isValidImageCrop(r)
    || l.x + l.width !== r.x || l.y !== r.y || l.width !== r.width || l.height !== r.height) return null;
  return { left, right };
}

/** Reordering preserves the rendered halves as ordinary cropped images. */
export function unlinkInvalidSpreads(project: ZineProject): void {
  const ids = new Set(project.pages.flatMap(page => page.content.flatMap(content =>
    content.type === 'image' && (content.properties as ImageProperties).spreadId
      ? [(content.properties as ImageProperties).spreadId!] : [])));
  for (const id of ids) {
    if (getValidSpread(project, id)) continue;
    for (const member of findSpreadMembers(project, id)) {
      delete member.properties.spreadId;
      delete member.properties.spreadSide;
    }
  }
}
