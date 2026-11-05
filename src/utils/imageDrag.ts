export const ZINE_ASSET_DRAG_TYPE = 'application/x-zine-asset-id';

export function getDraggedAssetId(event: DragEvent): number | null {
  const value = event.dataTransfer?.getData(ZINE_ASSET_DRAG_TYPE);
  if (!value) return null;
  const assetId = Number(value);
  return Number.isInteger(assetId) ? assetId : null;
}

export function hasDraggedAsset(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes(ZINE_ASSET_DRAG_TYPE);
}
