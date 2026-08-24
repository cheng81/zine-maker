import { defineStore } from 'pinia';
import { ref } from 'vue';

const IMAGE_CATALOG_PINNED_KEY = 'zineMaker.imageCatalogPinned';
const LEFT_SIDEBAR_SPLIT_KEY = 'zineMaker.leftSidebarSplit';

export const useUIStore = defineStore('ui', () => {
  const showTemplateSelector = ref(true);
  const showPageList = ref(true);
  const showProperties = ref(true);
  const showExportModal = ref(false);
  const showProjectsModal = ref(false);
  const exportImageData = ref('');
  const exportImages = ref<string[]>([]);
  const exportImageWidth = ref(0);
  const exportImageHeight = ref(0);
  const exportPdfData = ref('');
  const zoom = ref(1);
  const canvasOffset = ref({ x: 0, y: 0 });
  const shouldFit = ref(false);
  const pageListCollapsed = ref(false);
  const propertiesCollapsed = ref(false);
  const showPageNumbers = ref(true);
  const showFoldMarks = ref(true);
  const showCutMarks = ref(true);
  const showStorageNotice = ref(false);
  const leftSidebarTab = ref<'pages' | 'images'>('pages');
  const imageCatalogPinned = ref(readBooleanPreference(IMAGE_CATALOG_PINNED_KEY, false));
  const leftSidebarSplit = ref(readNumberPreference(LEFT_SIDEBAR_SPLIT_KEY, 0.58));

  function hideTemplateSelector(): void {
    showTemplateSelector.value = false;
  }

  function showTemplateSelectorModal(): void {
    showTemplateSelector.value = true;
  }

  function openProjectsModal(): void {
    showProjectsModal.value = true;
  }
  function closeProjectsModal(): void {
    showProjectsModal.value = false;
  }

  function togglePageList(): void {
    showPageList.value = !showPageList.value;
  }

  function toggleProperties(): void {
    showProperties.value = !showProperties.value;
  }

  function setZoom(newZoom: number): void {
    zoom.value = Math.max(0.1, Math.min(5, newZoom));
  }

  function setCanvasOffset(x: number, y: number): void {
    canvasOffset.value = { x, y };
  }

  function requestFit(): void {
    shouldFit.value = true;
  }

  function togglePageListCollapsed(): void {
    pageListCollapsed.value = !pageListCollapsed.value;
  }
  function openImageCatalog(): void {
    showPageList.value = true;
    pageListCollapsed.value = false;
    leftSidebarTab.value = 'images';
  }
  function setImageCatalogPinned(pinned: boolean): void {
    imageCatalogPinned.value = pinned;
    writePreference(IMAGE_CATALOG_PINNED_KEY, String(pinned));
  }
  function setLeftSidebarSplit(split: number): void {
    leftSidebarSplit.value = Math.min(0.75, Math.max(0.25, split));
    writePreference(LEFT_SIDEBAR_SPLIT_KEY, String(leftSidebarSplit.value));
  }
  function togglePropertiesCollapsed(): void {
    propertiesCollapsed.value = !propertiesCollapsed.value;
  }

  function openStorageNotice(): void {
    showStorageNotice.value = true;
  }
  function closeStorageNotice(): void {
    showStorageNotice.value = false;
  }

  return {
    showTemplateSelector,
    showPageList,
    showProperties,
    showExportModal,
    showProjectsModal,
    exportImageData,
    exportImages,
    exportImageWidth,
    exportImageHeight,
    exportPdfData,
    zoom,
    canvasOffset,
    shouldFit,
    pageListCollapsed,
    propertiesCollapsed,
    showPageNumbers,
    showFoldMarks,
    showCutMarks,
    showStorageNotice,
    leftSidebarTab,
    imageCatalogPinned,
    leftSidebarSplit,
    hideTemplateSelector,
    showTemplateSelectorModal,
    openProjectsModal,
    closeProjectsModal,
    togglePageList,
    toggleProperties,
    setZoom,
    setCanvasOffset,
    requestFit,
    togglePageListCollapsed,
    openImageCatalog,
    setImageCatalogPinned,
    setLeftSidebarSplit,
    togglePropertiesCollapsed,
    openStorageNotice,
    closeStorageNotice
  };
});

function readBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function readNumberPreference(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value >= 0.25 && value <= 0.75 ? value : fallback;
  } catch {
    return fallback;
  }
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The setting remains active for the current session when storage is unavailable.
  }
}
