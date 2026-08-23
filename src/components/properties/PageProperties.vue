<template>
  <div class="page-properties">
    <div class="property-section">
      <h4>Page Border</h4>

      <div class="property-group">
        <label>Scope</label>
        <div class="scope-control" role="group" aria-label="Border scope">
          <button
            type="button"
            :class="{ active: scope === 'project' }"
            @click="scope = 'project'"
          >
            Project
          </button>
          <button
            type="button"
            :class="{ active: scope === 'page' }"
            @click="scope = 'page'"
          >
            This page
          </button>
        </div>
      </div>

      <label v-if="scope === 'page'" class="override-toggle">
        <input type="checkbox" :checked="hasPageOverride" @change="togglePageOverride" />
        Override project border
      </label>

      <template v-if="scope === 'project' || hasPageOverride">
        <div class="property-group">
          <label>Width</label>
          <NumberInput
            :value="editableBorder.width"
            :min="0"
            :max="100"
            suffix="px"
            @update="updateBorder('width', $event)"
          />
        </div>

        <div class="property-group">
          <label>Color</label>
          <ColorPicker
            :value="editableBorder.color"
            @update="updateBorder('color', $event)"
          />
        </div>
      </template>

      <div v-else class="inherited-border">
        <span>Inherited from project</span>
        <span class="border-summary">
          <span class="color-swatch" :style="{ backgroundColor: projectBorder.color }" />
          {{ projectBorder.width }} px
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PageBorder } from '@/types';
import { useProjectStore } from '@/stores/project';
import { normalizePageBorder, resolvePageBorder } from '@/utils/pageBorder';
import ColorPicker from './ColorPicker.vue';
import NumberInput from './NumberInput.vue';

const projectStore = useProjectStore();
const scope = ref<'project' | 'page'>('page');

const projectBorder = computed(() => normalizePageBorder(projectStore.currentProject?.pageBorder));
const hasPageOverride = computed(() => Boolean(projectStore.currentPage?.border));
const editableBorder = computed(() => {
  const project = projectStore.currentProject;
  const page = projectStore.currentPage;
  if (!project || !page) return normalizePageBorder();
  return scope.value === 'project'
    ? projectBorder.value
    : resolvePageBorder(project, page);
});

function togglePageOverride(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked;
  projectStore.updateCurrentPageBorder(enabled ? { ...editableBorder.value } : undefined);
}

function updateBorder(key: keyof PageBorder, value: string | number) {
  const border = normalizePageBorder({ ...editableBorder.value, [key]: value });
  if (scope.value === 'project') projectStore.updateProjectPageBorder(border);
  else projectStore.updateCurrentPageBorder(border);
}
</script>

<style scoped>
.page-properties {
  display: flex;
  flex-direction: column;
}

.property-section {
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 1rem;
}

.property-section h4 {
  margin: 0 0 0.75rem;
  padding-bottom: 6px;
  border-bottom: 2px dashed var(--border-soft);
  color: var(--ui-ink);
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: uppercase;
}

.property-group {
  margin-bottom: 1rem;
}

.property-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--ui-ink);
  font-size: 0.8rem;
  font-weight: 500;
}

.scope-control {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.scope-control button {
  min-height: 34px;
  border: 1px solid #d1d5db;
  background: white;
  color: var(--ui-ink);
  cursor: pointer;
  font-size: 0.8rem;
}

.scope-control button:first-child {
  border-radius: 4px 0 0 4px;
}

.scope-control button:last-child {
  margin-left: -1px;
  border-radius: 0 4px 4px 0;
}

.scope-control button.active {
  position: relative;
  border-color: #2563eb;
  background: #dbeafe;
  color: #1e3a8a;
}

.override-toggle {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 1rem;
  color: var(--ui-ink);
  font-size: 0.8rem;
}

.inherited-border {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  color: #6b7280;
  font-size: 0.75rem;
}

.border-summary {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}

.color-swatch {
  width: 14px;
  height: 14px;
  border: 1px solid #d1d5db;
  border-radius: 2px;
}
</style>
