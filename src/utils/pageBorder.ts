import type { ImageProperties, PageBorder, ZinePage, ZineProject } from '@/types';
import { getValidSpread } from '@/utils/imageSpread';

export const DEFAULT_PAGE_BORDER: Readonly<PageBorder> = {
  width: 0,
  color: '#000000',
};

export function normalizePageBorder(border?: Partial<PageBorder> | null): PageBorder {
  const width = Number.isFinite(border?.width)
    ? Math.min(100, Math.max(0, Number(border?.width)))
    : DEFAULT_PAGE_BORDER.width;
  const color = typeof border?.color === 'string' && border.color.trim()
    ? border.color
    : DEFAULT_PAGE_BORDER.color;
  return { width, color };
}

export function resolvePageBorder(
  project: Pick<ZineProject, 'pageBorder'>,
  page: Pick<ZinePage, 'border'>
): PageBorder {
  return normalizePageBorder(page.border ?? project.pageBorder);
}

export function pageBorderRect(
  pageWidth: number,
  pageHeight: number,
  border: PageBorder
): { x: number; y: number; width: number; height: number; strokeWidth: number } {
  const strokeWidth = Math.min(border.width, pageWidth, pageHeight);
  const inset = strokeWidth / 2;
  return {
    x: inset,
    y: inset,
    width: Math.max(0, pageWidth - strokeWidth),
    height: Math.max(0, pageHeight - strokeWidth),
    strokeWidth,
  };
}

export type PageBorderEdge = 'top' | 'right' | 'bottom' | 'left';

export interface PageBorderSegment {
  edge: PageBorderEdge;
  points: number[];
  stroke: string;
  strokeWidth: number;
  lineCap: 'square';
  listening: false;
}

/** Square caps retain the rectangle's outer corners, including at an open seam. */
export function pageBorderSegments(
  pageWidth: number,
  pageHeight: number,
  border: PageBorder,
  suppressedEdges: readonly PageBorderEdge[] = [],
): PageBorderSegment[] {
  if (![pageWidth, pageHeight, border.width].every(value => Number.isFinite(value) && value > 0)) return [];
  const rect = pageBorderRect(pageWidth, pageHeight, border);
  const x = rect.x;
  const y = rect.y;
  const right = x + rect.width;
  const bottom = y + rect.height;
  const edges: { edge: PageBorderEdge; points: number[] }[] = [
    { edge: 'top', points: [x, y, right, y] },
    { edge: 'right', points: [right, y, right, bottom] },
    { edge: 'bottom', points: [right, bottom, x, bottom] },
    { edge: 'left', points: [x, bottom, x, y] },
  ];
  return edges.filter(({ edge }) => !suppressedEdges.includes(edge)).map(segment => ({
    ...segment, stroke: border.color, strokeWidth: rect.strokeWidth, lineCap: 'square', listening: false,
  }));
}

/** Suppression is derived at render time and never mutates saved border settings. */
export function suppressedSpreadBorderEdges(project: ZineProject, page: ZinePage): PageBorderEdge[] {
  for (const content of page.content) {
    if (content.type !== 'image') continue;
    const spreadId = (content.properties as ImageProperties).spreadId;
    if (!spreadId) continue;
    const pair = getValidSpread(project, spreadId);
    if (!pair || pair.left.content.visible === false || pair.right.content.visible === false) continue;
    if (pair.left.page.id === page.id) return ['right'];
    if (pair.right.page.id === page.id) return ['left'];
  }
  return [];
}
