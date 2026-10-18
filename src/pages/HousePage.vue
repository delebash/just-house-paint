<script setup>
// SPDX-License-Identifier: MIT
// One house — the visualizer (PRD F2–F9): the photo with the paint on it (components/HouseCanvas on
// Konva, painted by services/painter.js — the ratio tint in linear light, docs/dev/RESEARCH.md),
// the tools above it, and the side panel's tabs: Parts, Colors, Schemes, Designs. The colors on
// screen are a draft until saved as a design (stores/house.js). Long work — finding the parts, an
// engine's download, the AI photo — runs as server jobs on the task strip (services/jobs.js).
// The page fills its area (pageFill): the canvas and the panel each scroll on their own.
import {
  confirmDialog,
  EmptyState,
  errorMessage,
  PaneHeader,
  pageFill,
  pushToast,
  reportError,
  requestBlob,
  saveBlob,
  UiBanner,
  UiButton,
  UiSegmented,
  UiSlider,
  UiTabStrip,
  UiToggle,
} from "@delebash/ui";
import { stroke as brushStroke } from "just-house-paint-server/shared/masks.js";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import AiPhotoDialog from "../components/AiPhotoDialog.vue";
import ColorsTab from "../components/ColorsTab.vue";
import DesignsTab from "../components/DesignsTab.vue";
import EngineInstallCard from "../components/EngineInstallCard.vue";
import HouseCanvas from "../components/HouseCanvas.vue";
import PartsTab from "../components/PartsTab.vue";
import SchemesTab from "../components/SchemesTab.vue";
import { drawPixels, maskOf, pixelsOf, pngOf } from "../services/maskImage.js";
import { createPainter } from "../services/painter.js";
import { partName } from "../services/partNames.js";
import { useEnginesStore } from "../stores/engines.js";
import { useHouseStore } from "../stores/house.js";
import { usePaintsStore } from "../stores/paints.js";
import { useSettingsStore } from "../stores/settings.js";
import { useUiStore } from "../stores/ui.js";

const { t, te } = useI18n();
const route = useRoute();
const router = useRouter();
const house = useHouseStore();
const paints = usePaintsStore();
const engines = useEnginesStore();
const settings = useSettingsStore();
const ui = useUiStore();

const loadFailed = ref(null);
const tab = ref("parts");
const tool = ref("look");
const brushSize = ref(24);
const showOutlines = ref(true);
const compare = ref(false);
const split = ref(0.5);
const busy = ref({ find: false, ai: false, export: false });
// the AI photo dialog: closed (null), the install offer ({ render: null }) or a kept render
const aiDialog = ref(null);

// what the canvas draws
const photo = shallowRef(null);
const painted = shallowRef(null);
const overlay = shallowRef(null);
const version = ref(0);
const deltaE = ref({});
let painter = null;

const texture = computed({
  get: () => ui.texture,
  set: (v) => ui.setTexture(v),
});

const imagePath = (size) => `/v1/houses/${encodeURIComponent(house.house.id)}/image?size=${size}`;

async function load() {
  loadFailed.value = null;
  painter = null;
  photo.value = null;
  painted.value = null;
  try {
    await Promise.all([house.open(route.params.id), paints.loadBrands(), engines.loadStatus(), settings.load()]);
    await paints.paints(Object.values(house.colors));
    await loadPhoto();
    await loadMasks(house.parts.map((p) => p.key));
    repaint();
  } catch (e) {
    loadFailed.value = e;
  }
}
onMounted(load);
watch(
  () => route.params.id,
  (id, old) => id && id !== old && load(),
);

async function loadPhoto() {
  const { displayWidth: w, displayHeight: h } = house.house;
  const pixels = await pixelsOf(await requestBlob(imagePath("display")), w, h);
  photo.value = drawPixels(pixels, w, h);
  painter = createPainter({ rgba: pixels, width: w, height: h });
}

async function loadMasks(keys) {
  const { displayWidth: w, displayHeight: h, id } = house.house;
  await Promise.all(
    keys.map(async (key) => {
      try {
        const blob = await requestBlob(`/v1/houses/${encodeURIComponent(id)}/parts/${encodeURIComponent(key)}/mask?v=${house.maskVersions[key] || 0}`);
        painter.setMask(key, await maskOf(blob, w, h), texture.value);
      } catch {
        // a part without its mask file paints nothing; the others still do
      }
    }),
  );
}
watch(
  () => house.maskVersions,
  async (now, before) => {
    if (!painter) return;
    const changed = Object.keys(now).filter((k) => now[k] !== before?.[k]);
    if (!changed.length) return;
    await loadMasks(changed);
    repaint();
  },
);

/** The painting order: the parts' own (the server's), so a later part paints over an earlier one. */
const order = computed(() => house.parts.map((p) => p.key));

function hexColors() {
  const colors = {};
  for (const [part, id] of Object.entries(house.colors)) colors[part] = paints.byId[id]?.hex || null;
  return colors;
}

function repaint() {
  if (!painter) return;
  const { rgba, deltaE: dE } = painter.paint(hexColors(), order.value);
  painted.value = drawPixels(rgba, painter.width, painter.height, painted.value);
  deltaE.value = dE;
  drawOverlay();
  version.value++;
}
watch(
  () => house.colors,
  async () => {
    await paints.paints(Object.values(house.colors));
    repaint();
  },
);
watch(texture, (v) => {
  painter?.setTexture(v);
  repaint();
});

/** The selected part's outline (every part's, lightly, while the Parts tab is open). */
function drawOverlay() {
  if (!painter || !showOutlines.value) {
    overlay.value = null;
    return;
  }
  const w = painter.width;
  const h = painter.height;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const keys = tab.value === "parts" ? order.value : house.selectedPart ? [house.selectedPart] : [];
  for (const key of keys) {
    const mask = painter.mask(key);
    if (!mask) continue;
    const strong = key === house.selectedPart;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (mask[i] < 128) continue;
        if (mask[i - 1] >= 128 && mask[i + 1] >= 128 && mask[i - w] >= 128 && mask[i + w] >= 128) continue;
        const p = i * 4;
        rgba[p] = 255;
        rgba[p + 1] = strong ? 204 : 255;
        rgba[p + 2] = strong ? 0 : 255;
        rgba[p + 3] = strong ? 255 : 150;
      }
  }
  overlay.value = drawPixels(rgba, w, h, overlay.value?.width === w ? overlay.value : null);
}
watch([showOutlines, tab, () => house.selectedPart], () => {
  drawOverlay();
  version.value++;
});

function onPick({ x, y }) {
  const paintable = order.value.filter((k) => house.parts.find((p) => p.key === k)?.paintable);
  const key = painter?.partAt(x, y, paintable);
  if (key) house.selectedPart = key;
}

let saveTimer = null;
function onStroke({ points, radius, mode }) {
  const key = house.selectedPart;
  const mask = key && painter?.mask(key);
  if (!mask) return;
  brushStroke(mask, painter.width, painter.height, points, radius, mode);
  painter.touched(key);
  repaint();
  // the mask is saved a moment after the last stroke
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await house.saveMask(key, await pngOf(mask, painter.width, painter.height));
    } catch (e) {
      reportError(e);
    }
  }, 600);
}
onBeforeUnmount(() => clearTimeout(saveTimer));

async function onBox(box) {
  if (!house.selectedPart) return;
  try {
    await house.box(house.selectedPart, box, "add");
  } catch (e) {
    reportError(e);
  }
}

async function findParts() {
  if (!engines.finderInstalled) {
    tab.value = "parts";
    return;
  }
  if (house.parts.length) {
    const yes = await confirmDialog({ title: t("house.find.againTitle"), message: t("house.find.againMessage"), confirmLabel: t("house.find.again") });
    if (!yes) return;
  }
  busy.value.find = true;
  try {
    await house.findParts(t("house.find.task", { name: house.house.name }));
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  } finally {
    busy.value.find = false;
  }
}

async function aiPhoto() {
  if (!engines.aiphotoInstalled) {
    aiDialog.value = { render: null };
    return;
  }
  busy.value.ai = true;
  try {
    const render = await house.aiPhoto(t("house.ai.task", { name: house.house.name }));
    aiDialog.value = { render };
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  } finally {
    busy.value.ai = false;
  }
}

/** The painted photo at full size: the original, the masks scaled up, the same paint. */
async function saveImage() {
  busy.value.export = true;
  try {
    const { width: W, height: H, name } = house.house;
    const big = createPainter({ rgba: await pixelsOf(await requestBlob(imagePath("original")), W, H), width: W, height: H });
    for (const key of order.value) {
      const mask = painter.mask(key);
      if (mask) big.setMask(key, await maskOf(await pngOf(mask, painter.width, painter.height), W, H), texture.value);
    }
    const { rgba } = big.paint(hexColors(), order.value);
    const canvas = drawPixels(rgba, W, H);
    const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    await saveBlob(out, `${name} — ${t("house.export.suffix")}.jpg`, { title: t("house.export.save"), filterName: "JPEG", filterExt: "jpg" });
  } catch (e) {
    reportError(e);
  } finally {
    busy.value.export = false;
  }
}

/** The paints on screen, one line per part, for the store. */
async function copyColorList() {
  const lines = [];
  for (const part of house.paintableParts) {
    const p = paints.byId[house.colors[part.key]];
    if (p) lines.push(`${partName(part.key, { t, te })}: ${p.displayName}`);
  }
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    pushToast({ kind: "success", title: t("house.export.copied") });
  } catch (e) {
    reportError(e);
  }
}

const failedReason = computed(() => {
  if (!loadFailed.value) return "";
  const { title, detail } = errorMessage(loadFailed.value);
  return [title, detail].filter(Boolean).join(" — ");
});
const tools = computed(() => [
  { value: "look", label: t("house.tools.look"), title: t("house.tools.lookHint") },
  { value: "brush", label: t("house.tools.brush"), title: t("house.tools.brushHint") },
  { value: "eraser", label: t("house.tools.eraser"), title: t("house.tools.eraserHint") },
  { value: "box", label: t("house.tools.box"), title: t("house.tools.boxHint") },
]);
const tabs = computed(() => [
  { id: "parts", label: t("house.tabs.parts") },
  { id: "colors", label: t("house.tabs.colors") },
  { id: "schemes", label: t("house.tabs.schemes") },
  { id: "designs", label: t("house.tabs.designs") },
]);
const strokeColor = computed(() => paints.byId[house.colors[house.selectedPart]]?.hex || "#ffcc00");
const hasColors = computed(() => Object.keys(house.colors).length > 0);
</script>

<template>
  <q-page :style-fn="pageFill" class="page house">
    <PaneHeader :eyebrow="t('houses.title')" :title="house.house?.name || ''" help-key="painting">
      <UiButton intent="ghost" :label="t('house.back')" @click="router.push('/')" />
      <UiButton
        intent="secondary" :disabled="!house.house || busy.find"
        :label="house.parts.length ? t('house.find.again') : t('house.find.button')" @click="findParts"
      />
      <UiButton intent="secondary" :disabled="!house.paintableParts.length || busy.ai || !hasColors" :label="t('house.ai.button')" @click="aiPhoto" />
      <UiButton intent="ghost" :disabled="!hasColors" :label="t('house.export.copyList')" @click="copyColorList" />
      <UiButton intent="primary" :disabled="!painted || busy.export" :label="t('house.export.save')" @click="saveImage" />
    </PaneHeader>

    <UiBanner v-if="loadFailed" class="page__banner">
      {{ t("house.loadFailed", { reason: failedReason }) }}
      <template #action><UiButton intent="secondary" size="small" :label="t('kit.common.retry')" @click="load" /></template>
    </UiBanner>

    <div v-else-if="house.house" class="house__body">
      <section class="house__stage">
        <div class="house__tools">
          <UiSegmented v-model="tool" :options="tools" :aria-label="t('house.tools.label')" />
          <label v-if="tool === 'brush' || tool === 'eraser'" class="house__tool">
            <span>{{ t("house.tools.size") }}</span>
            <UiSlider v-model="brushSize" :min="2" :max="120" :step="1" width="short" :aria-label="t('house.tools.size')" />
          </label>
          <label class="house__tool">
            <UiToggle v-model="showOutlines" :aria-label="t('house.tools.outlines')" />
            <span>{{ t("house.tools.outlines") }}</span>
          </label>
          <label class="house__tool">
            <UiToggle v-model="compare" :aria-label="t('house.tools.compare')" />
            <span>{{ t("house.tools.compare") }}</span>
          </label>
          <UiSlider v-if="compare" v-model="split" :min="0" :max="1" :step="0.01" width="short" :show-number="false" :aria-label="t('house.tools.split')" />
          <label class="house__tool">
            <span>{{ t("house.tools.texture") }}</span>
            <UiSlider v-model="texture" :min="0" :max="1" :step="0.05" width="short" :aria-label="t('house.tools.texture')" />
          </label>
        </div>
        <HouseCanvas
          class="house__canvas"
          :photo="photo" :painted="painted" :overlay="overlay" :version="version" :split="compare ? split : null"
          :tool="tool" :brush-size="brushSize" :stroke-color="strokeColor"
          @pick="onPick" @stroke="onStroke" @box="onBox"
        />
      </section>

      <aside class="house__panel">
        <UiTabStrip v-model="tab" :tabs="tabs" :aria-label="t('house.tabs.label')" />
        <div class="house__tab">
          <template v-if="tab === 'parts'">
            <EngineInstallCard v-if="!engines.finderInstalled" kind="finder" />
            <EmptyState
              v-else-if="!house.parts.length" icon="Sparkle" :title="t('house.find.emptyTitle')" :message="t('house.find.emptyMessage')"
              :action-label="t('house.find.button')" @action="findParts"
            />
            <PartsTab v-else :delta-e="deltaE" />
          </template>
          <ColorsTab v-else-if="tab === 'colors'" />
          <SchemesTab v-else-if="tab === 'schemes'" />
          <DesignsTab v-else @show-render="(r) => (aiDialog = { render: r })" />
        </div>
      </aside>
    </div>
    <q-inner-loading :showing="house.loading && !house.house" :label="t('kit.common.loading')" />

    <AiPhotoDialog
      v-if="aiDialog" :render="aiDialog.render" :house-name="house.house?.name || ''"
      @installed="aiDialog = null" @close="aiDialog = null"
    />
  </q-page>
</template>

<style scoped>
.house {
  display: flex;
  flex-direction: column;
}
.house__body {
  flex: 1 1 auto;
  display: flex;
  gap: var(--sp-3);
  min-height: 0;
}
.house__stage {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-height: 0;
}
.house__canvas {
  flex: 1 1 auto;
  min-height: 0;
}
.house__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
}
.house__tool {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}
.house__panel {
  flex: 0 0 380px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--border);
  padding-left: var(--sp-3);
}
.house__tab {
  flex: 1 1 auto;
  overflow: auto;
  min-height: 0;
  padding-top: var(--sp-3);
}
</style>
