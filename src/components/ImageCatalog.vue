<template>
  <div class="image-catalog" @dragover="onCatalogDragOver" @drop="onCatalogDrop">
    <div class="catalog-toolbar">
      <button class="upload-button" type="button" :disabled="uploading" @click="fileInput?.click()">
        <Upload :size="16" />
        {{ uploading ? 'Uploading...' : 'Upload images' }}
      </button>
      <input
        ref="fileInput"
        class="hidden-input"
        type="file"
        accept="image/*"
        multiple
        @change="onFileSelect"
      />
    </div>

    <p v-if="message" class="catalog-message" :class="{ error: hasFailures }" role="status">
      {{ message }}
    </p>

    <div v-if="catalogItems.length" class="catalog-grid">
      <article
        v-for="item in catalogItems"
        :key="item.id"
        class="catalog-item"
        :class="{ selected: selectedAssetId === item.id, missing: !item.asset }"
        :draggable="Boolean(item.asset)"
        @click="selectedAssetId = item.id"
        @dblclick="insertAsset(item.id)"
        @dragstart="onAssetDragStart(item.id, $event)"
      >
        <div class="thumbnail">
          <img v-if="item.previewUrl" :src="item.previewUrl" :alt="item.asset?.name || 'Missing image'" />
          <ImageOff v-else :size="24" />
        </div>
        <div class="item-details">
          <span class="item-name" :title="item.asset?.name || 'Missing image'">
            {{ item.asset?.name || 'Missing image' }}
          </span>
          <span class="usage-count">{{ usageLabel(item.usageCount) }}</span>
        </div>
        <button
          class="delete-button"
          type="button"
          :disabled="item.usageCount > 0"
          :title="item.usageCount > 0 ? `Used ${item.usageCount} times` : 'Remove from catalog'"
          :aria-label="item.usageCount > 0 ? `Image used ${item.usageCount} times` : 'Remove image from catalog'"
          @click.stop="removeAsset(item.id)"
        >
          <Trash2 :size="14" />
        </button>
      </article>
    </div>

    <div v-else class="empty-catalog" @click="fileInput?.click()">
      <Images :size="30" />
      <span>No images in this project</span>
    </div>

    <div v-if="selectedAsset" class="catalog-actions">
      <button class="insert-button" type="button" @click="insertAsset(selectedAsset.id)">
        <Plus :size="16" />
        Insert on current page
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { ImageOff, Images, Plus, Trash2, Upload } from 'lucide-vue-next';
import { useAssetStore, type ImageAssetRecord } from '@/stores/assetStore';
import { useProjectStore } from '@/stores/project';
import { useToolsStore } from '@/stores/tools';
import { deleteAssetIfUnreferenced } from '@/utils/persistence';
import { getAssetUsageCount } from '@/utils/projectAssets';
import { ZINE_ASSET_DRAG_TYPE } from '@/utils/imageDrag';

interface CatalogItem {
  id: number;
  asset?: ImageAssetRecord;
  previewUrl?: string;
  usageCount: number;
}

const assetStore = useAssetStore();
const projectStore = useProjectStore();
const toolsStore = useToolsStore();
const fileInput = ref<HTMLInputElement | null>(null);
const assets = ref<ImageAssetRecord[]>([]);
const selectedAssetId = ref<number | null>(null);
const uploading = ref(false);
const message = ref('');
const hasFailures = ref(false);
const previewUrls = new Map<number, string>();

const catalogItems = computed<CatalogItem[]>(() => {
  const project = projectStore.currentProject;
  if (!project) return [];
  const byId = new Map(assets.value.map(asset => [asset.id, asset]));
  return (project.assetIds || []).map(id => {
    const asset = byId.get(id);
    return {
      id,
      asset,
      previewUrl: asset ? previewUrls.get(id) : undefined,
      usageCount: getAssetUsageCount(project, id),
    };
  }).sort((a, b) => {
    if (!a.asset) return 1;
    if (!b.asset) return -1;
    return b.asset.createdAt.localeCompare(a.asset.createdAt);
  });
});

const selectedAsset = computed(() => (
  assets.value.find(asset => asset.id === selectedAssetId.value)
));

watch(
  () => `${projectStore.currentProject?.id || ''}:${(projectStore.currentProject?.assetIds || []).join(',')}`,
  () => loadCatalog(),
  { immediate: true }
);

onUnmounted(revokePreviewUrls);

async function loadCatalog() {
  revokePreviewUrls();
  const ids = projectStore.currentProject?.assetIds || [];
  try {
    assets.value = await assetStore.getAssetRecords(ids);
    assets.value.forEach(asset => previewUrls.set(asset.id, URL.createObjectURL(asset.file)));
  } catch {
    assets.value = [];
    hasFailures.value = true;
    message.value = 'The image catalog could not be loaded.';
  }
  if (selectedAssetId.value != null && !ids.includes(selectedAssetId.value)) selectedAssetId.value = null;
}

function revokePreviewUrls() {
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls.clear();
}

async function importFiles(files: File[]) {
  if (!files.length) return;
  uploading.value = true;
  message.value = '';
  hasFailures.value = false;
  try {
    const result = await assetStore.addAssets(files);
    if (result.assets.length) {
      projectStore.addAssetsToCatalog(result.assets.map(asset => asset.id));
      selectedAssetId.value = result.assets[result.assets.length - 1].id;
    }
    if (result.failures.length) {
      hasFailures.value = true;
      const failures = result.failures.map(failure => `${failure.fileName}: ${failure.reason}`).join('; ');
      message.value = `Added ${result.assets.length}; skipped ${result.failures.length}. ${failures}`;
    } else {
      message.value = `Added ${result.assets.length} image${result.assets.length === 1 ? '' : 's'}.`;
    }
    await loadCatalog();
  } catch (error) {
    hasFailures.value = true;
    message.value = error instanceof Error ? error.message : 'Images could not be uploaded.';
  } finally {
    uploading.value = false;
  }
}

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  void importFiles(Array.from(input.files || []));
  input.value = '';
}

function onCatalogDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

function onCatalogDrop(event: DragEvent) {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  void importFiles(Array.from(event.dataTransfer.files));
}

function onAssetDragStart(assetId: number, event: DragEvent) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(ZINE_ASSET_DRAG_TYPE, String(assetId));
  event.dataTransfer.effectAllowed = 'copy';
  selectedAssetId.value = assetId;
}

function insertAsset(assetId: number) {
  const asset = assets.value.find(candidate => candidate.id === assetId);
  const page = projectStore.currentPage;
  if (!asset || !page) return;
  const contentId = projectStore.addImageAssetToPage(page.id, asset);
  if (!contentId) return;
  projectStore.selectContent(contentId);
  toolsStore.setActiveTool('select');
}

async function removeAsset(assetId: number) {
  const project = projectStore.currentProject;
  if (!project || getAssetUsageCount(project, assetId) > 0) return;
  if (!confirm('Remove this image from the project catalog?')) return;
  if (!projectStore.removeAssetFromCatalog(assetId)) return;
  await projectStore.manualSave();
  await deleteAssetIfUnreferenced(assetId);
  await loadCatalog();
}

function usageLabel(count: number): string {
  return count === 0 ? 'Unused' : `${count} placement${count === 1 ? '' : 's'}`;
}
</script>

<style scoped>
.image-catalog {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.catalog-toolbar,
.catalog-actions {
  flex: 0 0 auto;
}

.upload-button,
.insert-button {
  width: 100%;
  min-height: 40px;
  border: 1.5px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--ui-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  cursor: pointer;
  font-weight: 600;
}

.upload-button:hover,
.insert-button:hover {
  background: var(--surface);
}

.upload-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.hidden-input { display: none; }

.catalog-message {
  margin: 0;
  padding: 0.45rem;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  color: var(--ui-ink);
  font-size: 0.75rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.catalog-message.error { color: #b91c1c; }

.catalog-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 0.5rem;
}

.catalog-item {
  position: relative;
  min-width: 0;
  border: 2px solid transparent;
  border-radius: 6px;
  background: var(--surface);
  padding: 0.35rem;
  cursor: grab;
}

.catalog-item:hover { border-color: var(--border-soft); }
.catalog-item.selected { border-color: var(--border); box-shadow: 2px 2px 0 #000; }
.catalog-item.missing { cursor: default; }

.thumbnail {
  width: 100%;
  aspect-ratio: 1;
  background: white;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #6b7280;
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.item-details {
  min-width: 0;
  padding-top: 0.3rem;
  padding-right: 1.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.item-name {
  font-size: 0.75rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usage-count { font-size: 0.68rem; color: #6b7280; }

.delete-button {
  position: absolute;
  right: 0.3rem;
  bottom: 0.3rem;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #b91c1c;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.delete-button:hover:not(:disabled) { background: #fee2e2; }
.delete-button:disabled { color: #9ca3af; cursor: not-allowed; }

.empty-catalog {
  flex: 1;
  min-height: 140px;
  border: 2px dashed var(--border-soft);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #6b7280;
  text-align: center;
  font-size: 0.8rem;
  cursor: pointer;
}

.insert-button { background: var(--accent-green); color: #000; }
</style>
