<template>
  <div class="page-list" :class="{ collapsed: uiStore.pageListCollapsed }">
    <div class="page-list-header">
      <div class="sidebar-tabs">
        <button
          class="sidebar-tab"
          :class="{ active: pinnedLayout || uiStore.leftSidebarTab === 'pages' }"
          @click="uiStore.leftSidebarTab = 'pages'"
          @dragenter="onPagesTabDragEnter"
          @dragleave="cancelTabSwitch"
        >Pages</button>
        <button
          class="sidebar-tab"
          :class="{ active: pinnedLayout || uiStore.leftSidebarTab === 'images' }"
          @click="uiStore.leftSidebarTab = 'images'"
        >Images</button>
      </div>
      <button
        v-if="!isMobile"
        class="pin-button"
        type="button"
        :class="{ active: uiStore.imageCatalogPinned }"
        :title="uiStore.imageCatalogPinned ? 'Unpin image catalog' : 'Pin image catalog'"
        :aria-label="uiStore.imageCatalogPinned ? 'Unpin image catalog' : 'Pin image catalog'"
        :aria-pressed="uiStore.imageCatalogPinned"
        @click="toggleImageCatalogPin"
      >
        <PinOff v-if="uiStore.imageCatalogPinned" :size="16" />
        <Pin v-else :size="16" />
      </button>
      <span class="page-count" :title="sidebarCountTitle">
        {{ sidebarCount }}
      </span>
      <button class="collapse-button" @click="uiStore.togglePageListCollapsed()">
        <ChevronRight v-if="uiStore.pageListCollapsed" :size="20" />
        <ChevronDown v-else :size="20" />
      </button>
    </div>

    <div
      ref="splitContainerRef"
      class="sidebar-content"
      :class="{ 'pinned-sidebar': pinnedLayout, resizing: resizingSplit }"
      :style="pinnedLayout ? pinnedGridStyle : undefined"
    >
      <div v-show="pinnedLayout || uiStore.leftSidebarTab === 'pages'" class="sidebar-pane pages-pane">
        <div class="pages-grid" ref="pagesGridRef">
          <div
            v-for="(page, index) in projectStore.currentProject?.pages"
            :key="page.id"
            class="page-item"
            :class="{
              active: index === projectStore.currentPageIndex,
              'asset-drop-target': dropTargetPageId === page.id,
            }"
            @click="projectStore.setCurrentPage(index)"
            @dragover="onPageDragOver(page.id, $event)"
            @dragleave="onPageDragLeave(page.id)"
            @drop.stop="onPageAssetDrop(page.id, index, $event)"
          >
            <div class="page-preview">
              <div class="page-number">{{ page.pageNumber }}</div>
              <div class="page-content-preview">
                <div class="mini-page" :style="{ backgroundColor: page.backgroundColor || '#ffffff' }">
                  <div class="mini-content" v-for="(_, i) in page.content.slice(0,4)" :key="i" :style="{ width: (24 + (i%3)*18) + '%'}"></div>
                  <div v-if="resolvedBorder(page).width > 0" class="mini-page-border" :style="miniBorderStyle(page)" />
                </div>
              </div>
            </div>
            <div class="page-info">
              <div class="page-title" @dblclick.stop="startEdit(page)" v-if="editingId !== page.id">{{ pageTitle(page) }}</div>
              <input v-else class="title-input" :value="editValue" @input="onEditInput($event)" @keydown.enter.prevent="commitEdit(page)" @keydown.esc.prevent="cancelEdit" @blur="commitEdit(page)" />
              <div class="page-stats">{{ page.content.length }} items</div>
            </div>
          </div>
        </div>

        <div class="page-actions">
          <div class="export-options">
            <label><input type="checkbox" v-model="uiStore.showPageNumbers" /> Page numbers</label>
            <label><input type="checkbox" v-model="uiStore.showFoldMarks" /> Fold marks</label>
            <label><input type="checkbox" v-model="uiStore.showCutMarks" /> Cut marks</label>
          </div>
          <button @click="exportZine" class="export-button export-button--green">Export Zine for Printing</button>
        </div>
      </div>

      <div
        v-if="pinnedLayout"
        class="split-divider"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize pages and images panels"
        :aria-valuenow="Math.round(uiStore.leftSidebarSplit * 100)"
        aria-valuemin="25"
        aria-valuemax="75"
        tabindex="0"
        @pointerdown="startSplitResize"
        @dblclick="resetSplit"
        @keydown="onSplitKeydown"
      >
        <GripHorizontal :size="15" />
      </div>

      <div v-show="pinnedLayout || uiStore.leftSidebarTab === 'images'" class="sidebar-pane images-pane">
        <ImageCatalog />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSortable } from '@vueuse/integrations/useSortable';
import { useProjectStore } from '@/stores/project';
import { useUIStore } from '@/stores/ui';
import { useAssetStore } from '@/stores/assetStore';
import { exportZineForTemplate } from '@/composables/useZineExport';
import { ChevronRight, ChevronDown, GripHorizontal, Pin, PinOff } from 'lucide-vue-next';
import ImageCatalog from '@/components/ImageCatalog.vue';
import { getDraggedAssetId, hasDraggedAsset } from '@/utils/imageDrag';
import { useToolsStore } from '@/stores/tools';
import type { ZinePage } from '@/types';
import { resolvePageBorder } from '@/utils/pageBorder';

const projectStore = useProjectStore();
const uiStore = useUIStore();
const assetStore = useAssetStore();
const toolsStore = useToolsStore();

const editingId = ref<string | null>(null);
const editValue = ref('');
const dropTargetPageId = ref<string | null>(null);
const splitContainerRef = ref<HTMLElement | null>(null);
const resizingSplit = ref(false);
const isMobile = ref(typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches);
let tabSwitchTimer: ReturnType<typeof setTimeout> | null = null;
let mobileMediaQuery: MediaQueryList | null = null;
let previousBodyCursor = '';
let previousBodyUserSelect = '';

const pagesGridRef = ref<HTMLElement | null>(null);
const pageIds = computed(() => projectStore.currentProject?.pages.map(p => p.id) ?? []);
const pinnedLayout = computed(() => uiStore.imageCatalogPinned && !isMobile.value);
const pinnedGridStyle = computed(() => ({
  gridTemplateRows: `${uiStore.leftSidebarSplit}fr 10px ${1 - uiStore.leftSidebarSplit}fr`,
}));
const sidebarCount = computed(() => {
  const imageCount = projectStore.currentProject?.assetIds?.length || 0;
  if (pinnedLayout.value) return `${projectStore.pageCount}p / ${imageCount}i`;
  return uiStore.leftSidebarTab === 'pages'
    ? `${projectStore.pageCount} pages`
    : `${imageCount} images`;
});
const sidebarCountTitle = computed(() => (
  pinnedLayout.value
    ? `${projectStore.pageCount} pages, ${projectStore.currentProject?.assetIds?.length || 0} images`
    : sidebarCount.value
));

function resolvedBorder(page: ZinePage) {
  const project = projectStore.currentProject;
  return project ? resolvePageBorder(project, page) : { width: 0, color: '#000000' };
}

function miniBorderStyle(page: ZinePage) {
  const border = resolvedBorder(page);
  return {
    borderColor: border.color,
    borderWidth: `${Math.max(1, Math.min(6, border.width / 4))}px`,
  };
}

useSortable(pagesGridRef, pageIds, {
  animation: 150,
  ghostClass: 'sortable-ghost',
  chosenClass: 'sortable-chosen',
  dragClass: 'sortable-drag',
  filter: '.title-input',
  preventOnFilter: false,
  onEnd(evt) {
    const { oldIndex, newIndex } = evt;
    if (oldIndex != null && newIndex != null && oldIndex !== newIndex) {
      projectStore.reorderPages(oldIndex, newIndex);
    }
  },
});

function pageTitle(page: any): string {
  const tpl = projectStore.currentProject?.template;
  if (!tpl) return page.title;
  if (page.pageNumber === 1) return 'Front Cover';
  if (page.pageNumber === tpl.pageCount) return 'Back Cover';
  return page.title;
}

function startEdit(page: any): void {
  editingId.value = page.id;
  editValue.value = page.title;
}
function onEditInput(e: Event): void {
  editValue.value = (e.target as HTMLInputElement).value;
}
function commitEdit(page: any): void {
  if (editingId.value !== page.id) { editingId.value = null; return; }
  const val = editValue.value.trim();
  if (val && val !== page.title) {
    projectStore.renamePage(page.id, val);
  }
  editingId.value = null;
}
function cancelEdit(): void { editingId.value = null; }

function onPagesTabDragEnter(event: DragEvent) {
  if (pinnedLayout.value || !hasDraggedAsset(event) || uiStore.leftSidebarTab === 'pages') return;
  event.preventDefault();
  cancelTabSwitch();
  tabSwitchTimer = setTimeout(() => {
    uiStore.leftSidebarTab = 'pages';
    tabSwitchTimer = null;
  }, 350);
}

function cancelTabSwitch() {
  if (tabSwitchTimer) clearTimeout(tabSwitchTimer);
  tabSwitchTimer = null;
}

function onPageDragOver(pageId: string, event: DragEvent) {
  if (!hasDraggedAsset(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  dropTargetPageId.value = pageId;
}

function onPageDragLeave(pageId: string) {
  if (dropTargetPageId.value === pageId) dropTargetPageId.value = null;
}

async function onPageAssetDrop(pageId: string, pageIndex: number, event: DragEvent) {
  const assetId = getDraggedAssetId(event);
  dropTargetPageId.value = null;
  if (assetId == null) return;
  event.preventDefault();
  const asset = await assetStore.getAssetRecord(assetId);
  if (!asset) return;
  const contentId = projectStore.addImageAssetToPage(pageId, asset);
  if (!contentId) return;
  projectStore.setCurrentPage(pageIndex);
  projectStore.selectContent(contentId);
  toolsStore.setActiveTool('select');
}

function clearAssetDragState() {
  cancelTabSwitch();
  dropTargetPageId.value = null;
}

function toggleImageCatalogPin() {
  const pinned = !uiStore.imageCatalogPinned;
  uiStore.setImageCatalogPinned(pinned);
  if (!pinned) uiStore.leftSidebarTab = 'images';
}

function startSplitResize(event: PointerEvent) {
  if (!pinnedLayout.value || resizingSplit.value) return;
  event.preventDefault();
  resizingSplit.value = true;
  previousBodyCursor = document.body.style.cursor;
  previousBodyUserSelect = document.body.style.userSelect;
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', onSplitResize);
  window.addEventListener('pointerup', stopSplitResize, { once: true });
  window.addEventListener('pointercancel', stopSplitResize, { once: true });
}

function onSplitResize(event: PointerEvent) {
  const container = splitContainerRef.value;
  if (!resizingSplit.value || !container) return;
  const bounds = container.getBoundingClientRect();
  if (!bounds.height) return;
  const minPaneHeight = Math.min(160, bounds.height * 0.45);
  const minRatio = minPaneHeight / bounds.height;
  const split = Math.min(1 - minRatio, Math.max(minRatio, (event.clientY - bounds.top) / bounds.height));
  uiStore.leftSidebarSplit = split;
}

function stopSplitResize() {
  if (!resizingSplit.value) return;
  resizingSplit.value = false;
  uiStore.setLeftSidebarSplit(uiStore.leftSidebarSplit);
  document.body.style.cursor = previousBodyCursor;
  document.body.style.userSelect = previousBodyUserSelect;
  window.removeEventListener('pointermove', onSplitResize);
  window.removeEventListener('pointerup', stopSplitResize);
  window.removeEventListener('pointercancel', stopSplitResize);
}

function resetSplit() {
  uiStore.setLeftSidebarSplit(0.58);
}

function onSplitKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  if (event.key === 'Home') uiStore.setLeftSidebarSplit(0.25);
  else if (event.key === 'End') uiStore.setLeftSidebarSplit(0.75);
  else uiStore.setLeftSidebarSplit(uiStore.leftSidebarSplit + (event.key === 'ArrowDown' ? 0.03 : -0.03));
}

function updateMobileState(event: MediaQueryListEvent | MediaQueryList) {
  isMobile.value = event.matches;
  if (isMobile.value) stopSplitResize();
}

onMounted(() => {
  window.addEventListener('dragend', clearAssetDragState);
  window.addEventListener('drop', clearAssetDragState);
  mobileMediaQuery = window.matchMedia('(max-width: 900px)');
  updateMobileState(mobileMediaQuery);
  mobileMediaQuery.addEventListener('change', updateMobileState);
});

onUnmounted(() => {
  clearAssetDragState();
  stopSplitResize();
  window.removeEventListener('dragend', clearAssetDragState);
  window.removeEventListener('drop', clearAssetDragState);
  mobileMediaQuery?.removeEventListener('change', updateMobileState);
  mobileMediaQuery = null;
});

async function exportZine(): Promise<void> {
  if (!projectStore.currentProject) {
    console.error('No current project to export.');
    return;
  }
  try {
    const { images, pdfData, width, height } = await exportZineForTemplate(
      projectStore.currentProject,
      (id) => assetStore.getAsset(id),
      {
        showPageNumbers: uiStore.showPageNumbers,
        showFoldMarks: uiStore.showFoldMarks,
        showCutMarks: uiStore.showCutMarks,
        pixelRatio: 2,
      }
    );
    uiStore.exportImageWidth = width;
    uiStore.exportImageHeight = height;
    uiStore.exportImages = images;
    uiStore.exportImageData = images[0];
    uiStore.exportPdfData = pdfData;
    uiStore.showExportModal = true;

  } catch (error) {
    console.error('Export failed:', error);
    alert('Export failed. Please check the console for details.');
  }
}

</script>

<style scoped>
.page-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0.75rem;
  background: var(--panel);
  border-right: 1px solid var(--border-soft);
}
.page-list.collapsed { width: 40px; }
.page-list.collapsed .sidebar-content, .page-list.collapsed .page-count, .page-list.collapsed .sidebar-tabs, .page-list.collapsed .pin-button { display: none; }

.page-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-soft);
}

.sidebar-tabs {
  display: flex;
  gap: 0.2rem;
}

.pin-button {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-ink);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pin-button:hover,
.pin-button.active {
  border-color: var(--border-soft);
  background: var(--surface);
}

.sidebar-tab {
  min-height: 32px;
  padding: 0.35rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-ink);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
}

.sidebar-tab.active { border-color: var(--border); background: var(--surface); }

.sidebar-content { flex: 1; min-height: 0; display: flex; }
.sidebar-content.pinned-sidebar { display: grid; }
.sidebar-pane { flex: 1; min-width: 0; min-height: 0; }
.pages-pane { display: flex; flex-direction: column; }
.images-pane { overflow: hidden; }
.pinned-sidebar .images-pane { padding-top: 0.4rem; }

.split-divider {
  position: relative;
  min-height: 10px;
  color: #6b7280;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}

.split-divider::before {
  content: '';
  position: absolute;
  right: 0;
  left: 0;
  height: 1px;
  background: var(--border-soft);
}

.split-divider svg {
  position: relative;
  z-index: 1;
  background: var(--panel);
}

.split-divider:hover,
.split-divider:focus-visible,
.resizing .split-divider {
  color: var(--ui-ink);
  outline: none;
}

.page-count {
  min-width: 0;
  margin-left: auto;
  color: var(--ui-ink);
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.collapse-button { 
  border: none; 
  background: transparent; 
  color: var(--ui-ink); 
  cursor: pointer; 
  padding: 0.4rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
}

.collapse-button:hover {
  background: var(--surface);
}

.pages-grid {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-right: -0.5rem;
  padding-right: 0.5rem;
}

.page-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.2s ease;
}

.page-item:active {
  cursor: grabbing;
}

.page-item.sortable-ghost {
  opacity: 0.3;
  border-color: #000;
  border-style: dashed;
}

.page-item.sortable-chosen {
  box-shadow: 3px 3px 0 #000;
  border-color: #000;
  background: #e7ffe7;
}

.page-item.sortable-drag {
  opacity: 0.9;
}

.page-item:hover {
  border-color: #d1d5db;
  background: #f9fafb;
}

.page-item.active {
  border-color: #000;
  box-shadow: 2px 2px 0 #000;
  background: #e7ffe7;
}

.page-item.asset-drop-target {
  border-color: var(--accent-green);
  background: #e7ffe7;
  box-shadow: 2px 2px 0 #000;
}

.page-preview {
  position: relative;
  width: 64px;
  height: 48px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.page-number {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
}

.page-content-preview {
  position: absolute;
  top: 2px;
  left: 2px;
  right: 2px;
  bottom: 2px;
  display: flex;
  flex-wrap: wrap;
  gap: 1px;
}
.mini-page { background: #fff; border: 1px solid var(--border-soft); width: 100%; height: 100%; position: relative; }
.mini-page-border { position: absolute; inset: 0; z-index: 1; box-sizing: border-box; border-style: solid; pointer-events: none; }
.mini-content { height: 3px; background: var(--border); margin: 2px; }
.mini-icon { position: absolute; right: 2px; bottom: 2px; width: 16px; height: 16px; opacity: 0.9; }

.page-info {
  flex: 1;
  min-width: 0;
}

.page-title {
  font-weight: 500;
  color: #1f2937;
  font-size: 0.9rem;
  margin-bottom: 0.125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.title-input { font-size: 0.9rem; padding: 2px 4px; border: 1px solid var(--border-soft); border-radius: 4px; width: 100%; }

.page-stats {
  font-size: 0.75rem;
  color: #6b7280;
}

.page-actions {
  border-top: 1px solid #e5e7eb;
  padding-top: 0.75rem;
  margin-top: 0.75rem;
}

.export-options { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.5rem; color: var(--ui-ink); }
.export-options label { display: inline-flex; gap: 0.35rem; align-items: center; font-size: 0.85rem; }

.export-button {
  width: 100%;
  padding: 0.6rem;
  background: var(--accent-green);
  color: #000;
  border: 1.5px solid var(--border);
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 2px 2px 0 #000;
  transform: translate(0,0);
  transition: transform .04s, box-shadow .04s;
}

.export-button:hover { transform: translate(-1px,-1px); box-shadow: 3px 3px 0 #000; }

/* Mobile responsive page list */
@media (max-width: 768px) {
  .page-list {
    padding: 0.5rem;
    /* Improve touch scrolling */
    -webkit-overflow-scrolling: touch;
  }
  
  .page-item {
    padding: 0.6rem;
    gap: 0.6rem;
  }
  
  .page-preview {
    width: 56px;
    height: 42px;
  }
  
  .page-title {
    font-size: 0.85rem;
  }
  
  .page-stats {
    font-size: 0.7rem;
  }
  
  .export-button {
    padding: 0.7rem;
    font-size: 0.85rem;
    /* Larger touch target */
    min-height: 48px;
  }
  
  .export-options label {
    font-size: 0.8rem;
    /* Larger touch targets for checkboxes */
    padding: 0.2rem;
  }
  
  .export-options input[type="checkbox"] {
    width: 18px;
    height: 18px;
  }
}

@media (max-width: 480px) {
  .page-list {
    padding: 0.4rem;
  }
  
  .page-item {
    padding: 0.5rem;
    gap: 0.5rem;
  }
  
  .page-preview {
    width: 48px;
    height: 36px;
  }
  
  .page-title {
    font-size: 0.8rem;
  }
  
  .page-stats {
    font-size: 0.65rem;
  }
  
  .export-options {
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  
  .export-options label {
    font-size: 0.75rem;
    min-width: 0;
    flex: 0 0 auto;
  }
  
  .collapse-button {
    min-width: 36px;
    min-height: 36px;
    padding: 0.5rem;
  }
}
</style>
