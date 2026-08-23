<template>
  <div class="text-properties">
    <div class="property-section">
      <h4>Text</h4>
      <div class="property-group">
        <label>Content</label>
        <textarea 
          :value="textProps.text"
          @input="updateText(($event.target as HTMLTextAreaElement).value)"
          class="text-input"
          rows="3"
        />
      </div>
    </div>

    <div class="property-section">
      <h4>Typography</h4>
      <div class="property-group">
        <label>Font Family</label>
        <select 
          :value="textProps.fontFamily"
          @change="updateProperty('fontFamily', ($event.target as HTMLSelectElement).value)"
          class="select-input"
          :style="{ fontFamily: textProps.fontFamily }"
        >
          <option v-if="!availableFontFamilies.includes(textProps.fontFamily)" :value="textProps.fontFamily">
            {{ textProps.fontFamily }} (unavailable)
          </option>
          <optgroup label="Built-in fonts">
            <option v-for="family in systemFonts" :key="family" :value="family">{{ family }}</option>
          </optgroup>
          <optgroup v-if="uploadedFonts.length" label="Uploaded fonts">
            <option v-for="font in uploadedFonts" :key="font.id" :value="font.family">
              {{ font.family }}
            </option>
          </optgroup>
          <optgroup v-if="googleFonts.length" label="Google Fonts">
            <option v-for="font in googleFonts" :key="font.id" :value="font.family">
              {{ font.family }}
            </option>
          </optgroup>
        </select>
        <div class="font-actions">
          <button class="font-button" type="button" :disabled="uploadingFont" @click="fontInput?.click()">
            <Upload :size="15" />
            {{ uploadingFont ? 'Loading...' : 'Add font' }}
          </button>
          <button
            class="font-button"
            type="button"
            :disabled="addingGoogleFont"
            @click="openGoogleFontForm"
          >
            <Globe2 :size="15" />
            Google font
          </button>
          <button
            v-if="selectedCustomFont"
            class="font-button font-button--icon"
            type="button"
            title="Remove selected font"
            aria-label="Remove selected font"
            @click="removeSelectedFont"
          >
            <Trash2 :size="15" />
          </button>
          <input
            ref="fontInput"
            class="hidden-input"
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            @change="handleFontUpload"
          />
        </div>
        <form v-if="showGoogleFontForm" class="google-font-form" @submit.prevent="handleGoogleFontAdd">
          <label for="google-font-family">Google Fonts family</label>
          <div class="google-font-controls">
            <input
              id="google-font-family"
              ref="googleFontInput"
              v-model="googleFontFamily"
              class="text-input"
              type="text"
              placeholder="e.g. Libre Baskerville"
              autocomplete="off"
              :disabled="addingGoogleFont"
              @keydown.esc.prevent="closeGoogleFontForm"
            />
            <button
              class="font-button font-button--icon font-button--confirm"
              type="submit"
              title="Add Google Font"
              aria-label="Add Google Font"
              :disabled="addingGoogleFont || !googleFontFamily.trim()"
            >
              <LoaderCircle v-if="addingGoogleFont" class="spin" :size="15" />
              <Plus v-else :size="15" />
            </button>
            <button
              class="font-button font-button--icon"
              type="button"
              title="Cancel"
              aria-label="Cancel"
              :disabled="addingGoogleFont"
              @click="closeGoogleFontForm"
            >
              <X :size="15" />
            </button>
          </div>
        </form>
        <p v-if="fontError || fontStore.loadError" class="font-error" role="alert">
          {{ fontError || fontStore.loadError }}
        </p>
      </div>

      <div class="property-row">
        <div class="property-group">
          <label>Size</label>
          <NumberInput 
            :value="textProps.fontSize"
            @update="updateProperty('fontSize', $event)"
            :min="8"
            :max="200"
            suffix="px"
          />
        </div>
        <div class="property-group">
          <label>Line Height</label>
          <NumberInput 
            :value="textProps.lineHeight"
            @update="updateProperty('lineHeight', $event)"
            :min="0.5"
            :max="3"
            :step="0.1"
          />
        </div>
      </div>

      <div class="property-group">
        <label>Style</label>
        <div class="button-group">
          <button 
            @click="toggleWeight"
            :class="{ active: textProps.fontWeight === 'bold' }"
            class="style-button"
          >
            <strong>B</strong>
          </button>
          <button 
            @click="toggleStyle"
            :class="{ active: textProps.fontStyle === 'italic' }"
            class="style-button"
          >
            <em>I</em>
          </button>
          <button 
            @click="toggleDecoration"
            :class="{ active: textProps.textDecoration === 'underline' }"
            class="style-button"
          >
            <u>U</u>
          </button>
        </div>
      </div>

      <div class="property-group">
        <label>Alignment</label>
        <div class="button-group">
          <button 
            @click="updateProperty('textAlign', 'left')"
            :class="{ active: textProps.textAlign === 'left' }"
            class="align-button"
          >
            ⬅
          </button>
          <button 
            @click="updateProperty('textAlign', 'center')"
            :class="{ active: textProps.textAlign === 'center' }"
            class="align-button"
          >
            ↔
          </button>
          <button 
            @click="updateProperty('textAlign', 'right')"
            :class="{ active: textProps.textAlign === 'right' }"
            class="align-button"
          >
            ➡
          </button>
        </div>
      </div>
    </div>

    <div class="property-section">
      <h4>Appearance</h4>
      <div class="property-group">
        <label>Text Color</label>
        <ColorPicker 
          :value="textProps.color"
          @update="updateProperty('color', $event)"
        />
      </div>

      <div class="property-group" v-if="textProps.backgroundColor">
        <label>Background Color</label>
        <ColorPicker 
          :value="textProps.backgroundColor || '#ffffff'"
          @update="updateProperty('backgroundColor', $event)"
        />
      </div>

      <div class="property-group">
        <label>Padding</label>
        <NumberInput 
          :value="textProps.padding"
          @update="updateProperty('padding', $event)"
          :min="0"
          :max="50"
          suffix="px"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { ZineContent, TextProperties } from '@/types';
import { useFontStore } from '@/stores/fontStore';
import { Globe2, LoaderCircle, Plus, Trash2, Upload, X } from 'lucide-vue-next';
import ColorPicker from './ColorPicker.vue';
import NumberInput from './NumberInput.vue';

interface Props {
  content: ZineContent;
}

interface Emits {
  update: [contentId: string, updates: Partial<ZineContent>];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const fontStore = useFontStore();
const fontInput = ref<HTMLInputElement | null>(null);
const googleFontInput = ref<HTMLInputElement | null>(null);
const uploadingFont = ref(false);
const addingGoogleFont = ref(false);
const showGoogleFontForm = ref(false);
const googleFontFamily = ref('');
const fontError = ref<string | null>(null);
const systemFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Impact'];

const textProps = computed(() => props.content.properties as TextProperties);
const availableFontFamilies = computed(() => [
  ...systemFonts,
  ...fontStore.fonts.map(font => font.family),
]);
const uploadedFonts = computed(() => fontStore.fonts.filter(font => font.source === 'upload'));
const googleFonts = computed(() => fontStore.fonts.filter(font => font.source === 'google'));
const selectedCustomFont = computed(() => (
  fontStore.fonts.find(font => font.family === textProps.value.fontFamily)
));

function updateProperty(key: keyof TextProperties, value: any) {
  emit('update', props.content.id, {
    properties: { ...textProps.value, [key]: value }
  });
}

function updateText(text: string) {
  updateProperty('text', text);
}

function toggleWeight() {
  const newWeight = textProps.value.fontWeight === 'bold' ? 'normal' : 'bold';
  updateProperty('fontWeight', newWeight);
}

function toggleStyle() {
  const newStyle = textProps.value.fontStyle === 'italic' ? 'normal' : 'italic';
  updateProperty('fontStyle', newStyle);
}

function toggleDecoration() {
  const newDecoration = textProps.value.textDecoration === 'underline' ? 'none' : 'underline';
  updateProperty('textDecoration', newDecoration);
}

async function handleFontUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploadingFont.value = true;
  fontError.value = null;
  try {
    const font = await fontStore.addFont(file);
    updateProperty('fontFamily', font.family);
  } catch (error) {
    fontError.value = error instanceof Error ? error.message : 'The font could not be loaded.';
  } finally {
    uploadingFont.value = false;
    input.value = '';
  }
}

async function openGoogleFontForm() {
  showGoogleFontForm.value = true;
  fontError.value = null;
  await nextTick();
  googleFontInput.value?.focus();
}

function closeGoogleFontForm() {
  showGoogleFontForm.value = false;
  googleFontFamily.value = '';
  fontError.value = null;
}

async function handleGoogleFontAdd() {
  if (!googleFontFamily.value.trim()) return;

  addingGoogleFont.value = true;
  fontError.value = null;
  try {
    const font = await fontStore.addGoogleFont(googleFontFamily.value);
    updateProperty('fontFamily', font.family);
    showGoogleFontForm.value = false;
    googleFontFamily.value = '';
  } catch (error) {
    fontError.value = error instanceof Error ? error.message : 'The Google Font could not be loaded.';
  } finally {
    addingGoogleFont.value = false;
  }
}

async function removeSelectedFont() {
  const font = selectedCustomFont.value;
  if (!font || !confirm(`Remove "${font.family}" from Zine Maker?`)) return;

  updateProperty('fontFamily', 'Arial');
  try {
    await fontStore.deleteFont(font.id);
  } catch (error) {
    fontError.value = error instanceof Error ? error.message : 'The font could not be removed.';
  }
}
</script>

<style scoped>
.text-properties {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.property-section {
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 1rem;
}

.property-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.property-section h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ui-ink);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 2px dashed var(--border-soft);
  padding-bottom: 6px;
}

.property-group {
  margin-bottom: 0.75rem;
}

.property-group:last-child {
  margin-bottom: 0;
}

.property-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

label {
  display: block;
  font-size: 0.8rem;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.text-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.9rem;
  resize: vertical;
  min-height: 60px;
}

.select-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.9rem;
  background: white;
}

.font-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.4rem;
}

.font-button {
  min-height: 34px;
  padding: 0.4rem 0.6rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  color: var(--ui-ink);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font-size: 0.8rem;
}

.font-button:hover:not(:disabled) {
  background: #f3f4f6;
}

.font-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.font-button--icon {
  width: 34px;
  padding: 0;
  color: #b91c1c;
}

.font-button--confirm {
  color: var(--ui-ink);
}

.google-font-form {
  margin-top: 0.55rem;
}

.google-font-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px 34px;
  gap: 0.35rem;
  margin-top: 0.3rem;
}

.google-font-controls .text-input {
  min-width: 0;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.hidden-input {
  display: none;
}

.font-error {
  margin: 0.4rem 0 0;
  color: #b91c1c;
  font-size: 0.75rem;
  line-height: 1.3;
}

.button-group {
  display: flex;
  gap: 0.25rem;
}

.style-button,
.align-button {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.style-button.active,
.align-button.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.style-button:hover,
.align-button:hover {
  background: #f3f4f6;
}

.style-button.active:hover,
.align-button.active:hover {
  background: #2563eb;
}
</style>
