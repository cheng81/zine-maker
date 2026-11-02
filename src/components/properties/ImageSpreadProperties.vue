<template>
  <section class="spread-properties" :aria-labelledby="`${controlId}-title`">
    <h4 :id="`${controlId}-title`">Image Spread</h4>
    <template v-if="image.spreadId">
      <template v-if="pair">
        <p class="spread-role">Pages {{ pair.left.page.pageNumber }}–{{ pair.right.page.pageNumber }} · {{ image.spreadSide === 'left' ? 'Left' : 'Right' }} half</p>
        <p>Both halves share this image and crop. Position the image across both pages below.</p>
        <div v-for="axis in axes" :key="axis.key" class="focal-control">
          <label :for="`${controlId}-${axis.key}`">{{ axis.label }} focal position <span>{{ Math.round(focal[axis.key] * 100) }}%</span></label>
          <input :id="`${controlId}-${axis.key}`" type="range" min="0" max="100" step="1"
            :value="Math.round(focal[axis.key] * 100)" :disabled="!focal[axis.pan]"
            :aria-describedby="`${controlId}-${axis.key}-hint`"
            :aria-valuetext="`${Math.round(focal[axis.key] * 100)} percent`"
            @input="moveFocal(axis.key, $event)" />
          <small :id="`${controlId}-${axis.key}-hint`">{{ focal[axis.pan] ? axis.hint : 'The image fills this axis; there is no room to pan.' }}</small>
        </div>
      </template>
      <p v-else role="status">This spread is incomplete. Unlink it to edit the remaining image independently.</p>
      <button type="button" @click="unlink">Unlink Spread</button>
      <button type="button" class="delete-spread" @click="remove">Delete Spread</button>
    </template>
    <template v-else>
      <p>Create a spread to fill this page and an adjacent page with one continuous image. Other page content stays in place.</p>
      <p v-if="sourceReason" role="status">{{ sourceReason }}</p>
      <fieldset :disabled="Boolean(sourceReason)">
        <legend>Choose the other page</legend>
        <label v-for="option in partners" :key="option.direction" class="partner-option">
          <input type="radio" :name="`${controlId}-partner`" :value="option.pageId || option.direction"
            v-model="partnerId" :disabled="Boolean(option.reason)" />
          <span>{{ option.direction === 'previous' ? 'Previous' : 'Next' }} page{{ option.pageNumber ? ` · Page ${option.pageNumber}` : '' }}
            <small v-if="option.reason">{{ option.reason }}</small>
          </span>
        </label>
      </fieldset>
      <p v-if="chosen && !sourceReason" class="fill-summary">Pages {{ Math.min(pageNumber, chosen.pageNumber!) }} and {{ Math.max(pageNumber, chosen.pageNumber!) }} will be filled.</p>
      <p v-else-if="!sourceReason && !partners.some(option => !option.reason)" role="status">No adjacent page is available for a spread.</p>
      <button type="button" :disabled="Boolean(sourceReason) || !chosen" @click="create">Create Spread</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ImageProperties, ZineContent } from '@/types';
import { useProjectStore } from '@/stores/project';
import { getSpreadFocalPosition, getSpreadPartnerOptions, getValidSpread } from '@/utils/imageSpread';

const props = defineProps<{
  content: ZineContent;
  sourceDimensions: { width: number; height: number } | null;
  sourceReady: boolean;
  sourceLoading: boolean;
}>();
const store = useProjectStore();
const image = computed(() => props.content.properties as ImageProperties);
const controlId = computed(() => `spread-${props.content.id}`);
const page = computed(() => store.currentProject?.pages.find(candidate => candidate.content.some(content => content.id === props.content.id)));
const pageNumber = computed(() => page.value?.pageNumber || 0);
const partners = computed(() => store.currentProject && page.value ? getSpreadPartnerOptions(store.currentProject, page.value) : []);
const partnerId = ref('');
const error = ref('');
const chosen = computed(() => partners.value.find(option => option.pageId === partnerId.value && !option.reason));
const sourceReason = computed(() => {
  if (props.sourceLoading) return 'Loading image…';
  if (!props.sourceReady || !props.sourceDimensions) return 'The source image is unavailable. Change the image to create a spread.';
  if (props.sourceDimensions.width <= props.sourceDimensions.height) return 'Choose a landscape image to create a spread.';
  return '';
});
const pair = computed(() => store.currentProject && image.value.spreadId ? getValidSpread(store.currentProject, image.value.spreadId) : null);
const focal = computed(() => pair.value ? getSpreadFocalPosition(pair.value.left.properties.crop!) : { x: 0.5, y: 0.5, canPanX: false, canPanY: false });
const axes = [
  { key: 'x', pan: 'canPanX', label: 'Horizontal', hint: '0% shows the left side; 100% shows the right side.' },
  { key: 'y', pan: 'canPanY', label: 'Vertical', hint: '0% shows the top; 100% shows the bottom.' },
] as const;

watch(() => props.content.id, () => { partnerId.value = ''; error.value = ''; });
watch(partners, options => {
  if (!options.some(option => option.pageId === partnerId.value && !option.reason)) partnerId.value = '';
  const available = options.filter(option => !option.reason);
  if (!partnerId.value && available.length === 1) partnerId.value = available[0].pageId!;
}, { immediate: true });

function create() {
  if (sourceReason.value || !chosen.value?.pageId || !page.value || !props.sourceDimensions) return;
  const id = store.createImageSpread(page.value.id, props.content.id, chosen.value.pageId, props.sourceDimensions);
  error.value = id ? '' : 'The pages changed. Choose an available adjacent page and try again.';
}
function moveFocal(axis: 'x' | 'y', event: Event) {
  if (!image.value.spreadId) return;
  const value = Number((event.target as HTMLInputElement).value) / 100;
  store.setImageSpreadFocalPosition(image.value.spreadId, { x: focal.value.x, y: focal.value.y, [axis]: value });
}
function unlink() {
  if (image.value.spreadId && confirm('Unlink this spread? Both cropped images will stay on their pages and become independently editable. The inner page borders will return.')) {
    store.unlinkImageSpread(image.value.spreadId);
  }
}
function remove() {
  if (image.value.spreadId && confirm('Delete this spread? Both image halves will be removed from their pages. Other page content will stay in place.')) {
    store.removeImageSpread(image.value.spreadId);
  }
}
</script>

<style scoped>
.spread-properties { min-width: 0; border-bottom: 1px solid var(--border-soft); padding-bottom: 1rem; color: var(--ui-ink); }
h4 { margin: 0 0 0.75rem; font-size: 0.9rem; text-transform: uppercase; border-bottom: 2px dashed var(--border-soft); padding-bottom: 6px; }
p, legend, label { font-size: 0.8rem; line-height: 1.45; overflow-wrap: anywhere; }
p { margin: 0 0 0.75rem; }
.spread-role, .fill-summary { font-weight: 600; }
fieldset { margin: 0 0 0.75rem; padding: 0.5rem; min-width: 0; border: 1px solid var(--border-soft); border-radius: 4px; }
.partner-option { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.45rem 0; cursor: pointer; }
.partner-option:has(input:disabled) { opacity: 0.65; cursor: default; }
.partner-option input { flex-shrink: 0; margin: 0.2rem 0 0; }
small { display: block; font-size: 0.75rem; line-height: 1.4; margin-top: 0.2rem; }
.focal-control { margin-bottom: 1rem; }
.focal-control label { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.25rem; }
.focal-control input { display: block; width: 100%; margin: 0.5rem 0; min-height: 28px; accent-color: var(--ui-ink); }
button { width: 100%; min-height: 40px; padding: 0.5rem; margin-top: 0.5rem; border: 1px solid var(--border-soft); border-radius: 4px; background: var(--surface); color: var(--ui-ink); font-size: 0.8rem; cursor: pointer; }
button:disabled { opacity: 0.55; cursor: not-allowed; }
.delete-spread { color: #b91c1c; }
button:focus-visible, input:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
</style>
