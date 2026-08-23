import type { PageBorder, ZinePage, ZineProject } from '@/types';

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
