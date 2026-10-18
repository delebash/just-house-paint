<script setup>
// SPDX-License-Identifier: MIT
// One house — the visualizer (PRD F2–F9): the photo with the paint on it (components/HouseCanvas on
// Konva, painted by services/painter.js — the ratio tint in linear light, docs/dev/RESEARCH.md),
// the tools above it, and the side panel's tabs: Parts, Colors, Schemes, Designs. The colors on
// screen are a draft until saved as a design (stores/house.js). Long work — finding the parts, an
// engine's download, the AI photo — runs as server jobs on the task strip (services/jobs.js).
// Undo / Redo (Ctrl+Z, Ctrl+Y) cover the colors and the outline edits (services/houseHistory.js);
// Reset takes every paint off, or goes back to the open design. The page fills its area
// (pageFill): the canvas and the panel each scroll on their own.
import {
  AiTaskStrip,
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
  UiMenu,
  UiMenuItem,
  UiSegmented,
  UiSelect,
  UiSlider,
  UiTabStrip,
  UiToggle,
  useSurfaceTask,
} from "@delebash/ui";
import { onKeyStroke } from "@vueuse/core";
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
import { drawColorCard } from "../services/colorCard.js";
import { useHouseHistory } from "../services/houseHistory.js";
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
// "off", "photo" (the photo as taken) or a design's id — shown left of the split
const compareWith = ref("off");
// the compare as two pictures next to each other instead of the split line
const sideBySide = ref(false);
const split = ref(0.5);
const busy = ref({ find: false, ai: false, export: false });
// the AI photo dialog: closed (null), the install offer ({ render: null }) or a kept render
const aiDialog = ref(null);

// what the canvas draws
const photo = shallowRef(null);
const painted = shallowRef(null);
const overlay = shallowRef(null);
const before = shallowRef(null);
const version = ref(0);
const deltaE = ref({});
// { part: #rrggbb } — each part's color as photographed
const photographed = ref({});
let painter = null;

const texture = computed({
  get: () => ui.texture,
  set: (v) => ui.setTexture(v),
});
const outlines = computed({
  get: () => ui.outlines,
  set: (v) => ui.setOutlines(v),
});

const history = useHouseHistory({ apply: applyRecord });

// this house's long work, shown here while it runs (app-structure §8): finding the parts, the AI photo
const houseMeta = () => ({ houseId: house.house?.id });
const findTask = useSurfaceTask("parts.find", houseMeta);
const photoTask = useSurfaceTask("aiphoto.render", houseMeta);

const imagePath = (size) => `/v1/houses/${encodeURIComponent(house.house.id)}/image?size=${size}`;

async function load() {
  loadFailed.value = null;
  painter = null;
  photo.value = null;
  painted.value = null;
  compareWith.value = "off";
  history.reset();
  try {
    await Promise.all([house.open(route.params.id), paints.loadBrands(), engines.loadStatus(), settings.load()]);
    await paints.paints(Object.values(house.colors));
    await loadPhoto();
    const masks = await loadMasks(house.parts.map((p) => p.key));
    history.reset({ colors: house.colors, masks });
    photographed.value = {};
    refreshPhotographed();
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

/** Load the parts' outlines from the server into the painter; resolves { key: PNG Blob }. A part
 *  without its file yet (added by hand) gets an empty outline, so the brush can draw it. */
async function loadMasks(keys) {
  const { displayWidth: w, displayHeight: h, id } = house.house;
  const blobs = {};
  await Promise.all(
    keys.map(async (key) => {
      try {
        const blob = await requestBlob(`/v1/houses/${encodeURIComponent(id)}/parts/${encodeURIComponent(key)}/mask?v=${house.maskVersions[key] || 0}`);
        painter.setMask(key, await maskOf(blob, w, h), texture.value);
        blobs[key] = blob;
      } catch {
        painter.setMask(key, new Uint8Array(w * h), texture.value);
      }
    }),
  );
  return blobs;
}
// a part added by hand: its (empty) outline, ready for the brush
watch(
  () => house.parts.map((p) => p.key).join(),
  async () => {
    if (!painter) return;
    const fresh = house.parts.map((p) => p.key).filter((k) => !painter.mask(k));
    if (fresh.length) await loadMasks(fresh);
  },
);

/** The painting order: the parts' own (the server's), so a later part paints over an earlier one. */
const order = computed(() => house.parts.map((p) => p.key));

const hexOf = (colors) => Object.fromEntries(Object.entries(colors).map(([part, id]) => [part, paints.byId[id]?.hex || null]));

function repaint() {
  if (!painter) return;
  const { rgba, deltaE: dE } = painter.paint(hexOf(house.colors), order.value);
  painted.value = drawPixels(rgba, painter.width, painter.height, painted.value);
  deltaE.value = dE;
  drawOverlay();
  refreshCompare();
  version.value++;
}
watch(
  () => house.colors,
  async (colors) => {
    history.record({ colors });
    await paints.paints(Object.values(colors));
    repaint();
  },
);
watch(texture, (v) => {
  painter?.setTexture(v);
  repaint();
});

/** Each part's color as photographed — every part's, or only `keys`' after their outlines changed. */
function refreshPhotographed(keys = house.parts.map((p) => p.key)) {
  if (!painter) return;
  const next = { ...photographed.value };
  for (const key of keys) {
    const hex = painter.photographed(key);
    if (hex) next[key] = hex;
    else delete next[key];
  }
  photographed.value = next;
}

/** The outlines: the selected part's, every part's (the selected one stronger), or none. */
function drawOverlay() {
  if (!painter || outlines.value === "off") {
    overlay.value = null;
    return;
  }
  const w = painter.width;
  const h = painter.height;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const keys = outlines.value === "all" ? order.value : house.selectedPart ? [house.selectedPart] : [];
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
watch([outlines, () => house.selectedPart], () => {
  drawOverlay();
  version.value++;
});

// ── compare: the left of the split shows the photo as taken, or a saved design
const compareOptions = computed(() => [
  { value: "off", label: t("house.compare.off") },
  { value: "photo", label: t("house.compare.photo") },
  ...house.designs.map((d) => ({ value: d.id, label: d.name })),
]);
async function refreshCompare() {
  const d = house.designs.find((x) => x.id === compareWith.value);
  if (!painter || !d) {
    before.value = null;
    return;
  }
  await paints.paints(Object.values(d.colors));
  const { rgba } = painter.paint(hexOf(d.colors), order.value);
  before.value = drawPixels(rgba, painter.width, painter.height, before.value?.width === painter.width ? before.value : null);
  version.value++;
}
watch(compareWith, refreshCompare);
watch(
  () => house.designs,
  () => {
    if (compareWith.value !== "off" && compareWith.value !== "photo" && !house.designs.some((d) => d.id === compareWith.value)) compareWith.value = "off";
  },
);

// ── the canvas's events
function onPick({ x, y }) {
  if (!painter) return;
  if (tool.value === "pick") {
    // the eyedropper: the photo's own color there, matched to paints on the Colors tab
    house.pickColor(painter.sample(x, y));
    tab.value = "colors";
    return;
  }
  const paintable = order.value.filter((k) => house.parts.find((p) => p.key === k)?.paintable);
  const key = painter.partAt(x, y, paintable);
  if (key) house.selectedPart = key;
}

function findColor(hex) {
  house.pickColor(hex);
  tab.value = "colors";
}

// an outline's change is saved a moment after the last stroke on it — one timer per part
const saveTimers = new Map();
function scheduleSave(key, blob) {
  clearTimeout(saveTimers.get(key));
  saveTimers.set(
    key,
    setTimeout(async () => {
      saveTimers.delete(key);
      try {
        await house.saveMask(key, blob);
      } catch (e) {
        reportError(e);
      }
    }, 600),
  );
}
function cancelSave(key) {
  clearTimeout(saveTimers.get(key));
  saveTimers.delete(key);
}
onBeforeUnmount(() => {
  for (const [key] of saveTimers) cancelSave(key);
});

async function onStroke({ points, radius, mode }) {
  const key = house.selectedPart;
  const mask = key && painter?.mask(key);
  if (!mask) return;
  brushStroke(mask, painter.width, painter.height, points, radius, mode);
  painter.touched(key);
  refreshPhotographed([key]);
  repaint();
  const blob = await pngOf(mask, painter.width, painter.height);
  history.record({ masks: { [key]: blob } });
  scheduleSave(key, blob);
}

async function onBox(box) {
  if (!house.selectedPart) return;
  try {
    const changed = await house.box(house.selectedPart, box, "add");
    const masks = await loadMasks(changed);
    history.record({ masks });
    refreshPhotographed(changed);
    repaint();
  } catch (e) {
    reportError(e);
  }
}

/** Undo / Redo put a record back: its colors, and every outline that differs — repainted here and
 *  saved to the server (it owns them). An outline the record doesn't have (a part added by hand
 *  after it) goes back to empty. */
async function applyRecord(rec, prev) {
  house.setColors(rec.colors);
  const keys = [...new Set([...Object.keys(rec.masks), ...Object.keys(prev.masks)])];
  const changed = keys.filter((k) => rec.masks[k] !== prev.masks[k]);
  if (!changed.length || !painter) return;
  const { displayWidth: w, displayHeight: h } = house.house;
  const blobs = {};
  for (const key of changed) {
    cancelSave(key);
    blobs[key] = rec.masks[key] || (await pngOf(new Uint8Array(w * h), w, h));
    painter.setMask(key, await maskOf(blobs[key], w, h), texture.value);
  }
  refreshPhotographed(changed);
  repaint();
  for (const key of changed) {
    try {
      await house.saveMask(key, blobs[key]);
    } catch (e) {
      reportError(e);
    }
  }
}

// Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) — never while typing in a field
onKeyStroke(["z", "Z", "y", "Y"], (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const el = e.target;
  if (el?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName)) return;
  e.preventDefault();
  if (e.key.toLowerCase() === "z" && !e.shiftKey) history.undo();
  else history.redo();
});

/** The finder's progress in words: the part it is looking for now (the job's message is its key),
 *  or the model loading first — "Trim · 40%". */
function findProgress(job, n) {
  if (job.message === "loading") return t("house.find.loading", { n });
  if (job.message) return t("house.find.progress", { part: partName(job.message, { t, te }), n });
  return "";
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
    await house.findParts(t("house.find.task", { name: house.house.name }), findProgress);
    // new parts: their outlines, and the history starts over from them
    const masks = await loadMasks(house.parts.map((p) => p.key));
    history.reset({ colors: house.colors, masks });
    photographed.value = {};
    refreshPhotographed();
    repaint();
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
    const { rgba } = big.paint(hexOf(house.colors), order.value);
    const canvas = drawPixels(rgba, W, H);
    const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    await saveBlob(out, `${name} — ${t("house.export.suffix")}.jpg`, { title: t("house.export.save"), filterName: "JPEG", filterExt: "jpg" });
  } catch (e) {
    reportError(e);
  } finally {
    busy.value.export = false;
  }
}

/** The paints on screen, one per painted part, in the house's order. */
function paintedRows() {
  const rows = [];
  for (const part of house.paintableParts) {
    const p = paints.byId[house.colors[part.key]];
    if (p) rows.push({ part: partName(part.key, { t, te }), paint: p.displayName, hex: p.hex });
  }
  return rows;
}

async function copyColorList() {
  try {
    await navigator.clipboard.writeText(
      paintedRows()
        .map((r) => `${r.part}: ${r.paint}`)
        .join("\n"),
    );
    pushToast({ kind: "success", title: t("house.export.copied") });
  } catch (e) {
    reportError(e);
  }
}

/** The color card: the painted photo and its paints in one picture, for the store. */
async function saveColorCard() {
  try {
    const canvas = drawColorCard({
      image: painted.value,
      title: house.house.name,
      subtitle: house.design && !house.dirty ? house.design.name : t("colorCard.onScreen"),
      rows: paintedRows(),
      note: t("colorCard.note"),
    });
    const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    await saveBlob(out, `${house.house.name} — ${t("colorCard.suffix")}.png`, { title: t("designs.colorCard"), filterName: "PNG", filterExt: "png" });
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
  { value: "pick", label: t("house.tools.pick"), title: t("house.tools.pickHint") },
]);
const outlineOptions = computed(() => [
  { value: "selected", label: t("house.outlines.selected") },
  { value: "all", label: t("house.outlines.all") },
  { value: "off", label: t("house.outlines.off") },
]);
const tabs = computed(() => [
  { id: "parts", label: t("house.tabs.parts") },
  { id: "colors", label: t("house.tabs.colors") },
  { id: "schemes", label: t("house.tabs.schemes") },
  { id: "designs", label: t("house.tabs.designs") },
]);
const strokeColor = computed(() => paints.byId[house.colors[house.selectedPart]]?.hex || "#ffcc00");
const hasColors = computed(() => Object.keys(house.colors).length > 0);
const canRevert = computed(() => !!house.design && house.dirty);
</script>

<template>
  <q-page :style-fn="pageFill" class="page house">
    <PaneHeader :eyebrow="t('houses.title')" :title="house.house?.name || ''" help-key="painting">
      <UiButton intent="ghost" :label="t('house.back')" @click="router.push('/')" />
      <UiButton
        intent="secondary" :disabled="!house.house || busy.find || !!findTask"
        :label="house.parts.length ? t('house.find.again') : t('house.find.button')" @click="findParts"
      />
      <UiButton intent="secondary" :disabled="!house.paintableParts.length || busy.ai || !!photoTask || !hasColors" :label="t('house.ai.button')" @click="aiPhoto" />
      <UiButton intent="ghost" :disabled="!hasColors" :label="t('house.export.copyList')" @click="copyColorList" />
      <UiButton intent="primary" :disabled="!painted || busy.export" :label="t('house.export.save')" @click="saveImage" />
    </PaneHeader>
    <AiTaskStrip :task="findTask" />
    <AiTaskStrip :task="photoTask" />

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
          <span class="house__tool">
            <UiButton intent="secondary" size="small" :disabled="!history.canUndo.value" :label="t('house.undo')" :title="t('house.undoHint')" @click="history.undo()" />
            <UiButton intent="secondary" size="small" :disabled="!history.canRedo.value" :label="t('house.redo')" :title="t('house.redoHint')" @click="history.redo()" />
            <UiMenu
              :label="t('house.reset.label')" trigger-class="ui-btn ui-btn--secondary ui-btn--small"
              :disabled="!hasColors && !canRevert"
            >
              <template #trigger>{{ t("house.reset.button") }}</template>
              <UiMenuItem :disabled="!hasColors" @select="house.clearColors()">{{ t("house.reset.clear") }}</UiMenuItem>
              <UiMenuItem v-if="canRevert" @select="house.revertToDesign()">
                {{ t("house.reset.revert", { name: house.design.name }) }}
              </UiMenuItem>
            </UiMenu>
          </span>
        </div>
        <div class="house__tools">
          <span class="house__tool">
            <span>{{ t("house.tools.outlines") }}</span>
            <UiSegmented v-model="outlines" :options="outlineOptions" :aria-label="t('house.tools.outlines')" />
          </span>
          <span class="house__tool">
            <span>{{ t("house.compare.label") }}</span>
            <UiSelect v-model="compareWith" :options="compareOptions" width="name" :aria-label="t('house.compare.label')" />
          </span>
          <label v-if="compareWith !== 'off'" class="house__tool house__side">
            <UiToggle v-model="sideBySide" :aria-label="t('house.compare.sideBySide')" />
            <span>{{ t("house.compare.sideBySide") }}</span>
          </label>
          <UiSlider v-if="compareWith !== 'off' && !sideBySide" v-model="split" :min="0" :max="1" :step="0.01" width="short" :show-number="false" :aria-label="t('house.tools.split')" />
          <label class="house__tool">
            <span>{{ t("house.tools.texture") }}</span>
            <UiSlider v-model="texture" :min="0" :max="1" :step="0.05" width="short" :aria-label="t('house.tools.texture')" />
          </label>
        </div>
        <HouseCanvas
          class="house__canvas"
          :photo="photo" :painted="painted" :overlay="overlay" :before="before" :version="version"
          :split="compareWith !== 'off' ? split : null" :side-by-side="compareWith !== 'off' && sideBySide"
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
            <PartsTab v-else :delta-e="deltaE" :photographed="photographed" @find-color="findColor" />
          </template>
          <ColorsTab v-else-if="tab === 'colors'" />
          <SchemesTab v-else-if="tab === 'schemes'" />
          <DesignsTab v-else @show-render="(r) => (aiDialog = { render: r })" @color-card="saveColorCard" />
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
