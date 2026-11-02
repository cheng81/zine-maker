import type { NormalizedImageCrop } from '@/types';

/** Reject malformed crops rather than silently changing their composition. */
export function isValidImageCrop(crop: unknown): crop is NormalizedImageCrop {
  if (!crop || typeof crop !== 'object') return false;
  const { x, y, width, height } = crop as NormalizedImageCrop;
  return [x, y, width, height].every(Number.isFinite)
    && x >= 0 && y >= 0 && width > 0 && height > 0
    && width <= 1 && height <= 1
    && x + width <= 1 && y + height <= 1;
}

/** Use intrinsic source dimensions after load; never round shared crop edges. */
export function toKonvaImageCrop(
  crop: unknown,
  sourceWidth: number,
  sourceHeight: number,
): NormalizedImageCrop | undefined {
  if (!isValidImageCrop(crop)
    || !Number.isFinite(sourceWidth) || sourceWidth <= 0
    || !Number.isFinite(sourceHeight) || sourceHeight <= 0) return undefined;

  return {
    x: crop.x * sourceWidth,
    y: crop.y * sourceHeight,
    width: crop.width * sourceWidth,
    height: crop.height * sourceHeight,
  };
}
