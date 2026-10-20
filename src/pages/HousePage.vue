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
import { copyToClipboard } from "quasar";
import { safeTitle } from "@delebash/core/platform/filename";
import {
  AiTaskStrip,
  announce,
  confirmDialog,
  EmptyState,
  errorMessage,
  isolate,
  pageFill,
  PaneHeader,
  promptDialog,
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from "vue-router";
import AiPhotoDialog from "../components/AiPhotoDialog.vue";
import ColorsTab from "../components/ColorsTab.vue";
import DesignsTab from "../components/DesignsTab.vue";
import EngineInstallCard from "../components/EngineInstallCard.vue";
import HouseCanvas from "../components/HouseCanvas.vue";
import PartsTab from "../components/PartsTab.vue";
import SchemesTab from "../components/SchemesTab.vue";
import { drawColorCard } from "../services/colorCard.js";
import { useHouseHistory } from "../services/houseHistory.js";
import { exportSize, paintFullSize } from "../services/fullSizeImage.js";
import { drawPixels, maskOf, pixelsOf, pngOf } from "../services/maskImage.js";
import { holdChangesWhile, otherWindows } from "../services/otherWindows.js";
import { outlinePixels } from "../services/outlines.js";
import { createPainter } from "../services/painter.js";
import { partName } from "../services/partNames.js";
import { useEnginesStore } from "../stores/engines.js";
import { useHouseStore } from "../stores/house.js";
import { usePaintsStore } from "../stores/paints.js";
import { useSettingsStore } from "../stores/settings.js";
import { useUiStore } from "../stores/ui.js";

const { t, te, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const house = useHouseStore();
const paints = usePaintsStore();
const engines = useEnginesStore();
const settings = useSettingsStore();
const ui = useUiStore();

const loadFailed = ref(null);
// the house itself is gone (its own request answered 404) — not a file of it missing
const houseGone = ref(false);
const tab = ref("parts");
// the side panel's scroller: another tab opens at its top (it kept the last tab's place — the Parts tab opened at its
// end after a scroll down the Colors — the screens review, 2026-10-20)
const panelScroller = ref(null);
watch(tab, () => {
  if (panelScroller.value) panelScroller.value.scrollTop = 0;
});
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
// load() running: what it loads isn't a change to react to
let loading = false;
// the latest load() — an earlier one that finishes later stops
let loadSeq = 0;

const texture = computed({
  get: () => ui.texture,
  set: (v) => ui.setTexture(v),
});
// where the Texture slider is while it is dragged: the texture itself is applied when the slider is let
// go or its number box left (QSlider's `change` — quasar.dev/vue-components/slider), as each texture
// prepares every part again (~0.6 s for 15 parts at 2048 px, measured), too slow for every drag step
const textureShown = ref(ui.texture);
watch(texture, (v) => {
  textureShown.value = v;
});
// the Light: a brighter or duller day over the whole picture (1 = the photo's own light)
const light = computed({
  get: () => ui.light,
  set: (v) => ui.setLight(v),
});
// the selected part's paint in shade, on most of it and in light — for the Colors tab
const tones = ref(null);
const outlines = computed({
  get: () => ui.outlines,
  set: (v) => ui.setOutlines(v),
});

const history = useHouseHistory({ apply: applyRecord });

// a change to this house answered that the house itself is gone (deleted in another window or tab, or by a
// reset): the page says so, as when it opens a deleted house — instead of a toast for each later stroke
house.$onAction(({ name, onError }) => {
  if (name === "open") return; // load() handles its own answer
  onError((e) => {
    const p = e?.problem;
    // a design deleted in another window: its toast says so, and the house's designs are read again
    if (e?.status === 404 && /\/design-not-found$/.test(p?.type || "")) house.refreshDesigns().catch(() => {});
    if (e?.status !== 404 || !/\/house-not-found$/.test(p?.type || "") || p.houseId !== house.house?.id) return;
    houseGone.value = true;
    loadFailed.value = e;
    try {
      e.cancelled = true; // the page shows it: the caller's reportError shows nothing more
    } catch {
      // a frozen error: its toast shows too
    }
  });
});

// this house's long work, shown here while it runs (app-structure §8): finding the parts, the AI photo
const houseMeta = () => ({ houseId: house.house?.id });
const findTask = useSurfaceTask("parts.find", houseMeta);
const photoTask = useSurfaceTask("aiphoto.render", houseMeta);

const imagePath = (size) => `/v1/houses/${encodeURIComponent(house.house.id)}/image?size=${size}`;

async function load() {
  const seq = ++loadSeq;
  loading = true;
  loadFailed.value = null;
  houseGone.value = false;
  painter = null;
  photo.value = null;
  painted.value = null;
  compareWith.value = "off";
  history.reset();
  try {
    // this house's work the server is doing now (finding its parts, an AI photo — started before this
    // window reloaded, or in another one), asked before the house is read: a run that ends meanwhile is
    // still followed to its end and its parts read again, never left showing the outlines from before it
    const running = await house.runningJobs(route.params.id).catch(() => []);
    const opening = house.open(route.params.id).catch((e) => {
      if (e?.status === 404 && seq === loadSeq) houseGone.value = true;
      throw e;
    });
    await Promise.all([opening, paints.loadBrands(), engines.loadStatus(), settings.load()]);
    // another house was asked for meanwhile: its own load() shows it
    if (seq !== loadSeq || house.house?.id !== route.params.id) return;
    await paints.paints(housePaints());
    await loadPhoto();
    const masks = await loadMasks(house.parts.map((p) => p.key));
    // the outlines' version read with the house, before them: the page's writes send it from now on
    house.useOutlines(house.house.outlines);
    history.reset({ colors: house.colors, designId: house.designId, designBase: house.designBase, masks });
    photographed.value = {};
    refreshPhotographed();
    repaint();
    // still this house (another may have been asked for while its photo and outlines loaded)
    if (seq === loadSeq && house.house?.id === route.params.id) follow(running);
  } catch (e) {
    if (seq === loadSeq) loadFailed.value = e;
  } finally {
    if (seq === loadSeq) loading = false;
  }
}
onMounted(load);
/** The paints the house names: its colors, its paints now and its designs' (Compare draws them at once). */
function housePaints() {
  const designPaints = house.designs.flatMap((d) => Object.values(d.colors));
  return [...Object.values(house.colors), ...Object.values(house.house?.currentPaints || {}), ...designPaints];
}
// a brand's colors loaded again or removed (stores/paints.js forgetBrand): the house's paints are looked up
// again — one its brand no longer has is marked so (the Parts tab says it) and no longer painted, a changed
// one paints in its new color
watch(
  () => paints.brandsChanged,
  async () => {
    if (!house.house) return;
    await paints.paints(housePaints());
    repaint();
  },
);
// leaving with colors on screen that no design holds: asked first, as opening another design is
async function confirmLeave() {
  if (!house.house || !house.dirty || !Object.keys(house.colors).length) return true;
  return confirmDialog({ title: t("designs.discard.title"), message: t("house.leave.message"), confirmLabel: t("house.leave.confirm") });
}
onBeforeRouteLeave(confirmLeave);
// closing the window, a reload or Quit with such colors: asked first too (the HTML standard's beforeunload — a browser
// asks in its own words; the desktop app's shell shows its box on Electron's will-prevent-unload) — they were
// dropped silently (the eighteenth review)
function onBeforeUnload(e) {
  // a reload for data another window replaced (a restore, a reset): the colors were on data that is gone
  if (otherWindows.replaced) return;
  if (!house.house || !house.dirty || !Object.keys(house.colors).length) return;
  e.preventDefault();
  e.returnValue = "";
}
window.addEventListener("beforeunload", onBeforeUnload);
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));
onBeforeRouteUpdate((to, from) => (to.params.id !== from.params.id ? confirmLeave() : true));
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
 *  without its file yet (added by hand, the server's 404) gets an empty outline, so the brush can draw
 *  it; any other failure is reported and leaves the part without one — a stroke on an outline that
 *  didn't load would save over the real one. */
async function loadMasks(keys, failed = []) {
  const { displayWidth: w, displayHeight: h, id } = house.house;
  const blobs = {};
  await Promise.all(
    keys.map(async (key) => {
      try {
        const blob = await requestBlob(`/v1/houses/${encodeURIComponent(id)}/parts/${encodeURIComponent(key)}/mask?v=${house.maskVersions[key] || 0}`);
        painter.setMask(key, await maskOf(blob, w, h), texture.value);
        blobs[key] = blob;
      } catch (e) {
        if (e?.status === 404) painter.setMask(key, new Uint8Array(w * h), texture.value);
        else {
          failed.push(key);
          reportError(e);
        }
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

/** The parts found again — here, by the page this one replaced while the job ran, or in another window —
 *  or outlines another window changed: every outline anew (the store bumped their versions), their version
 *  taken once they are here, and the history starts over from them (an Undo would put back an outline from
 *  before the other window's change). No stroke meanwhile (outlineBusy). */
async function reloadParts() {
  outlineBusy.value++;
  // what waits to be saved was made on the outlines being replaced: it never lands with their new version
  dropWaitingWrites();
  try {
    const v = house.house.outlines;
    const failed = [];
    const masks = await loadMasks(house.parts.map((p) => p.key), failed);
    // their version only with all of them: a part still holding the old outline keeps the old version, whose next
    // write is refused and reads them again
    if (!failed.length) house.useOutlines(v);
    history.reset({ colors: house.colors, designId: house.designId, designBase: house.designBase, masks });
    photographed.value = {};
    refreshPhotographed();
    repaint();
  } finally {
    outlineBusy.value--;
  }
}
watch(
  () => [house.house?.id, house.house?.partsFoundAt],
  ([id, at], [oldId, oldAt]) => {
    if (painter && !loading && id && id === oldId && at !== oldAt) reloadParts().catch(reportError);
  },
);

/** The painting order: the parts' own (the server's), so a later part paints over an earlier one. */
const order = computed(() => house.parts.map((p) => p.key));

// the paint each part has now, as hex (its light is worked out from it — services/tint.js lightGain)
const currentHex = () => hexOf(house.house?.currentPaints || {});
/** The same paints on the same parts (an unset part and no part are the same). */
const sameColorsAs = (a, b) => {
  const ka = Object.keys(a).filter((k) => a[k]);
  const kb = Object.keys(b).filter((k) => b[k]);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};
const hexOf = (colors) => Object.fromEntries(Object.entries(colors).map(([part, id]) => [part, paints.byId[id]?.hex || null]));

function repaint() {
  if (!painter) return;
  const colors = hexOf(house.colors);
  const { rgba, deltaE: dE } = painter.paint(colors, order.value, { light: light.value, current: currentHex() });
  painted.value = drawPixels(rgba, painter.width, painter.height, painted.value);
  deltaE.value = dE;
  tones.value = house.selectedPart ? painter.tones(house.selectedPart, colors[house.selectedPart], light.value, currentHex()[house.selectedPart]) : null;
  drawOverlay();
  refreshCompare();
  version.value++;
}
watch(
  () => house.colors,
  async (colors) => {
    history.record({ colors, designId: house.designId, designBase: house.designBase });
    await paints.paints(Object.values(colors));
    repaint();
  },
);
// a design saved as a new one, or the open one deleted: the same colors, another (or no) design; a design saved:
// its new merge base — the current step says so, as no new step
watch(
  () => [house.designId, house.designBase],
  ([id, base]) => {
    if (sameColorsAs(house.colors, history.current().colors)) history.amendDesign(id, base);
  },
);
watch(texture, (v) => {
  painter?.setTexture(v);
  repaint();
});
watch(light, repaint);
// a part's paint-now set or cleared: its light changes
watch(
  () => JSON.stringify(house.house?.currentPaints || {}),
  async () => {
    await paints.paints(Object.values(house.house?.currentPaints || {}));
    repaint();
  },
);
watch(
  () => house.selectedPart,
  (key) => {
    if (painter) tones.value = key ? painter.tones(key, hexOf(house.colors)[key], light.value, currentHex()[key]) : null;
  },
);

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
  const keys = outlines.value === "all" ? order.value : house.selectedPart ? [house.selectedPart] : [];
  // each edge light with a dark line beside it, so it shows on a white house too (services/outlines.js)
  const rgba = outlinePixels((key) => painter.mask(key), keys, house.selectedPart, w, h);
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
// the latest refreshCompare — an earlier one that finishes later is dropped
let compareSeq = 0;
async function refreshCompare() {
  const seq = ++compareSeq;
  const d = house.designs.find((x) => x.id === compareWith.value);
  // the photo as taken, under the same Light as the paint (else the comparison isn't fair)
  if (painter && compareWith.value === "photo" && light.value !== 1) {
    const { rgba } = painter.paint({}, order.value, { light: light.value });
    before.value = drawPixels(rgba, painter.width, painter.height, before.value?.width === painter.width ? before.value : null);
    version.value++;
    return;
  }
  if (!painter || !d) {
    before.value = null;
    return;
  }
  await paints.paints(Object.values(d.colors));
  if (seq !== compareSeq || !painter) return;
  const { rgba } = painter.paint(hexOf(d.colors), order.value, { light: light.value, current: currentHex() });
  before.value = drawPixels(rgba, painter.width, painter.height, before.value?.width === painter.width ? before.value : null);
  version.value++;
}
watch(compareWith, refreshCompare);
// the compared design's colors its brand no longer has: those parts show as photographed — said, not left to look
// unpainted for no reason (the twenty-first review)
const compareGone = computed(() => {
  const d = house.designs.find((x) => x.id === compareWith.value);
  if (!d) return 0;
  const keys = new Set(house.paintableParts.map((p) => p.key));
  return Object.entries(d.colors).filter(([key, id]) => keys.has(key) && paints.missing[id]).length;
});
watch(
  () => house.designs,
  () => {
    if (compareWith.value === "off" || compareWith.value === "photo") return;
    // the compared design deleted: nothing to compare; saved again: its new colors
    if (!house.designs.some((d) => d.id === compareWith.value)) compareWith.value = "off";
    else refreshCompare();
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

// The page's outline writes (a stroke's save, an Undo's, a Box) go to the server one after another, each with
// the outlines' version the last one answered (If-Match, stores/house.js): this window's own never refuse each
// other, and two quick Undos never land out of order. One refused because the outlines aren't the ones it was
// made on — another window changed them (412), is finding the parts (409), or a backup is being restored (503) —
// drops the writes still waiting (they were made on the same outlines) and the page reads them again.
let chain = Promise.resolve();
let pendingWrites = 0;
let writeGen = 0;
// the outlines being read or a Box answering: a stroke now would be made on the outlines from before
const outlineBusy = ref(0);
// a stroke, an Undo or a save in the middle of its awaits (the refresh waits for it — holdChangesWhile)
let stroking = 0;
/** `fn` in the queue, made in generation `gen` — dropped when the outlines it was made on were replaced since. */
function queueWrite(fn, gen = writeGen) {
  pendingWrites++;
  const next = chain.catch(() => {}).then(() => (gen === writeGen ? fn() : null));
  chain = next;
  next.catch(() => {}).finally(() => pendingWrites--);
  return next;
}
function queueSave(key, blob, houseId, gen = writeGen) {
  queueWrite(() => house.saveMask(key, blob, houseId), gen).catch(onWriteRefused);
}
/** The writes still waiting are dropped (the outlines they were made on are being replaced). */
function dropWaitingWrites() {
  writeGen++;
  for (const key of [...saveTimers.keys()]) cancelSave(key);
}
/** The waiting saves sent now, and every write finished — before a Box or Find the parts, which carry the
 *  version the last save answers. */
async function flushWrites() {
  for (const { timer, run } of [...saveTimers.values()]) {
    clearTimeout(timer);
    run();
  }
  await chain.catch(() => {});
}
const STALE = /\/(outlines-changed|finding-parts|maintenance)$/;
/** A write's failure: shown; one refused for stale outlines also drops the waiting writes, and — another window
 *  changed them — the outlines are read again (a find, or a restore, brings its own). */
function onWriteRefused(e) {
  if (e?.cancelled) return;
  if (STALE.test(e?.problem?.type || "")) {
    dropWaitingWrites();
    if (e.status === 412) reloadOutlines().catch(reportError);
  }
  reportError(e);
}
/** The house's outlines as they are on the server now (another window changed them). */
async function reloadOutlines() {
  if (!house.house) return;
  outlineBusy.value++;
  try {
    const at = house.house.partsFoundAt;
    const { outlinesChanged } = await house.refresh();
    // a find's new parts load through the partsFoundAt watch
    if (outlinesChanged && house.house?.partsFoundAt === at) await reloadParts();
  } finally {
    outlineBusy.value--;
  }
}

// an outline's change is saved a moment after the last stroke on it — one timer per part, to the
// house it was drawn on; then a dark part's calming follows the new outline (kept as it was while the
// strokes went on: working it out takes too long for each one)
const saveTimers = new Map(); // key → { timer, run }
function scheduleSave(key, blob, gen = writeGen) {
  cancelSave(key);
  const houseId = house.house.id;
  const drawnOn = painter;
  const run = (leaving = false) => {
    saveTimers.delete(key);
    queueSave(key, blob, houseId, gen);
    if (!leaving && drawnOn === painter && painter?.calmAgain(key)) repaint();
  };
  saveTimers.set(key, { timer: setTimeout(run, 600), run });
}
function cancelSave(key) {
  clearTimeout(saveTimers.get(key)?.timer);
  saveTimers.delete(key);
}
// Another window changed something on the server (services/otherWindows.js): the house, its parts, designs, AI
// photos and running work read again in place — the zoom, the tool and the colors on screen stay; outlines that
// changed are read again (the history starts over), a find or an AI photo started there is followed here (the
// tools off while the parts are found), a brand's colors loaded again or removed there are looked up again. Never
// while a stroke or a save is under way: the change waits for them.
const releaseHold = holdChangesWhile(() => loading || stroking > 0 || saveTimers.size > 0 || pendingWrites > 0 || outlineBusy.value > 0);
let retryRefresh = null;
async function refreshFromServer() {
  if (!house.house || loading || !painter) return;
  clearTimeout(retryRefresh);
  // busy before the first await: no stroke starts on outlines about to be read again
  outlineBusy.value++;
  try {
    await refreshNow();
  } finally {
    outlineBusy.value--;
  }
}
async function refreshNow() {
  const id = house.house.id;
  // what the picture is made of: repainted only when it changed (another window's change to another house, its
  // prefs or settings leave this one as it is — a repaint is ~300 ms at 2048 px)
  const seen = () => JSON.stringify([house.house, house.parts, house.designs, house.colors]);
  const before = seen();
  try {
    const running = await house.runningJobs(id).catch(() => []);
    await reloadOutlines();
    if (house.house?.id !== id) return;
    await paints.refreshBrands(); // a brand changed: its own watch repaints
    if (seen() !== before) {
      await paints.paints(housePaints());
      repaint();
    }
    follow(running);
  } catch (e) {
    if (e?.cancelled) return;
    reportError(e);
    // the change isn't shown yet: tried again in a moment (the counter has moved on past it)
    retryRefresh = setTimeout(refreshFromServer, 5000);
  }
}
watch(() => otherWindows.changes, refreshFromServer);

// leaving the page saves what is still waiting (a stroke made just before Back isn't lost)
onBeforeUnmount(() => {
  releaseHold();
  clearTimeout(retryRefresh);
  for (const { timer, run } of [...saveTimers.values()]) {
    clearTimeout(timer);
    run(true);
  }
});

// a stroke while the outlines are being read again isn't drawn: said once each time
let busySaid = false;
watch(outlineBusy, (n) => {
  if (!n) busySaid = false;
});
async function onStroke({ points, radius, mode }) {
  if (finding.value) return;
  if (outlineBusy.value) {
    if (!busySaid) pushToast({ title: t("house.busyReading"), kind: "info", duration: 4000 });
    busySaid = true;
    return;
  }
  const key = house.selectedPart;
  const mask = key && painter?.mask(key);
  if (!mask) return;
  // the outlines it is drawn on: its save is made in this generation, and dropped if they were replaced since
  const gen = writeGen;
  stroking++;
  try {
    brushStroke(mask, painter.width, painter.height, points, radius, mode);
    painter.touched(key);
    refreshPhotographed([key]);
    repaint();
    const blob = await pngOf(mask, painter.width, painter.height);
    if (gen !== writeGen) return;
    history.record({ masks: { [key]: blob } });
    scheduleSave(key, blob, gen);
  } finally {
    stroking--;
  }
}

async function onBox(box) {
  if (!house.selectedPart || finding.value || outlineBusy.value) return;
  const key = house.selectedPart;
  outlineBusy.value++;
  try {
    await flushWrites();
    const changed = await queueWrite(() => house.box(key, box, "add"));
    if (!changed) return; // dropped: the outlines it was drawn on are being read again
    const masks = await loadMasks(changed);
    history.record({ masks });
    refreshPhotographed(changed);
    repaint();
  } catch (e) {
    onWriteRefused(e);
  } finally {
    outlineBusy.value--;
  }
}

/** Undo / Redo put a record back: its colors, and every outline that differs — repainted here and
 *  saved to the server (it owns them). An outline the record doesn't have (a part added by hand
 *  after it) goes back to empty. */
async function applyRecord(rec, prev) {
  // a design deleted since this record: the colors come back as a draft; else with the merge base they had
  const kept = house.designs.some((d) => d.id === rec.designId);
  house.setColors(rec.colors, kept ? rec.designId : null, kept ? rec.designBase : null);
  const keys = [...new Set([...Object.keys(rec.masks), ...Object.keys(prev.masks)])];
  const changed = keys.filter((k) => rec.masks[k] !== prev.masks[k]);
  if (!changed.length || !painter) return;
  const { displayWidth: w, displayHeight: h } = house.house;
  const gen = writeGen;
  stroking++;
  try {
    const blobs = {};
    for (const key of changed) {
      cancelSave(key);
      blobs[key] = rec.masks[key] || (await pngOf(new Uint8Array(w * h), w, h));
      if (gen !== writeGen) return; // the outlines were read again meanwhile: the history starts over from them
      painter.setMask(key, await maskOf(blobs[key], w, h), texture.value);
    }
    refreshPhotographed(changed);
    repaint();
    // saved without holding the history: a stroke made while they save is recorded as usual
    const houseId = house.house.id;
    for (const key of changed) queueSave(key, blobs[key], houseId, gen);
  } finally {
    stroking--;
  }
}

// Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) — never while typing in a field (its own undo is the browser's),
// never under a dialog (Quasar's QDialog — the kit's confirm, prompt and modals — or any modal one);
// a read-only input isn't typing: QSelect's keyboard focus is one (the Compare with list)
const typing = (el) => el?.isContentEditable || el?.tagName === "SELECT" || (["INPUT", "TEXTAREA"].includes(el?.tagName) && !el.readOnly);
onKeyStroke(["z", "Z", "y", "Y"], (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (typing(e.target) || document.querySelector('.q-dialog, [aria-modal="true"]')) return;
  e.preventDefault();
  if (e.key.toLowerCase() === "z" && !e.shiftKey) undo();
  else redo();
});

/** The finder's progress in words: the part it is looking for now (the job's message is its key),
 *  or the model loading first — "Trim · 40%". */
function findProgress(job, n) {
  if (job.message === "loading") return t("house.find.loading", { n });
  if (job.message) return t("house.find.progress", { part: partName(job.message, { t, te }), n });
  return "";
}

// While its work runs, a button is off but keeps keyboard focus: aria-disabled and the kit's
// .is-disabled look instead of `disabled`, which drops the focus to the page's body (WAI-ARIA APG,
// "Focusability of disabled controls"; Quasar's own `loading` keeps focus the same way, and UiButton
// turns `loading` into `disabled`). The work's function ignores a press meanwhile.
const waiting = (on) => (on ? { "aria-disabled": "true", class: "is-disabled" } : {});

/** Work on this house the server was already doing as the page opened (a reload, another window): followed
 *  here as if this page had started it — its progress on the strip, then the new parts or the AI photo. */
function follow(jobs) {
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (job?.state !== "running") continue;
    if (job.kind === "find-parts" && !finding.value) runFind({ job });
    else if (job.kind === "aiphoto" && !busy.value.ai && !photoTask.value) runAiPhoto(job);
  }
}

// while the parts are being found the outlines aren't edited (the brush, the eraser, the box): the run
// replaces them as it ends, and a stroke on the outline from before it would be saved over the new one
const finding = computed(() => busy.value.find || !!findTask.value);
const EDIT_TOOLS = ["brush", "eraser", "box"];
// Undo and Redo too, all of them: a step can put an outline back (and save it), and the run's end starts
// the history over from the parts it found anyway (reloadParts)
// and not while the outlines are being read again: a step would put back one from before them
const undo = () => !finding.value && !outlineBusy.value && history.undo();
const redo = () => !finding.value && !outlineBusy.value && history.redo();
watch(finding, (on) => {
  if (on && EDIT_TOOLS.includes(tool.value)) tool.value = "look";
});
// the box asks the part finder: removed while Box is chosen, Box is let go of
watch(
  () => engines.finderMissing,
  (missing) => {
    if (missing && tool.value === "box") tool.value = "look";
  },
);

async function findParts() {
  if (finding.value) return;
  // known not to be installed (before the status answers, the server says why if it must — as the Box tool does)
  if (engines.finderMissing) {
    // the part finder's install, shown and said: the Parts tab, its card brought into view and its Install focused
    // (with parts listed the card was below them, out of view, and nothing happened — the nineteenth review) — off
    // or not (focusable while off): still installing, or unable to run here, said so (it said "install it" while it
    // installed, and moved no focus — the twentieth review)
    tab.value = "parts";
    await nextTick();
    const card = document.querySelector(".house__tab .engine");
    card?.scrollIntoView?.({ block: "nearest" });
    card?.querySelector("button")?.focus();
    const runtime = engines.finder?.runtime;
    announce(t(engines.installing.finder ? "house.tools.finderInstalling" : runtime?.ok === false ? "house.tools.finderBlocked" : "house.tools.needsFinder"));
    return;
  }
  // the parts changed by hand can stay as they are (on unless the user unticks it)
  let keepEdited = false;
  const byHand = house.parts.filter((p) => p.source === "edited" || p.source === "added");
  const ask = { title: t("house.find.againTitle"), message: t("house.find.againMessage"), confirmLabel: t("house.find.again") };
  if (byHand.length) {
    const parts = new Intl.ListFormat(locale.value, { type: "conjunction" }).format(byHand.map((p) => partName(p.key, { t, te })));
    const answer = await promptDialog({ ...ask, fields: [{ key: "keep", type: "checkbox", label: t("house.find.keep", { parts }), defaultValue: true }] });
    if (!answer) return;
    keepEdited = answer.keep;
  } else if (house.parts.length) {
    if (!(await confirmDialog(ask))) return;
  }
  // its version is the one the last stroke's save answers
  await flushWrites();
  await runFind({ keepEdited });
}

/** Finding the parts — started here (`keepEdited`) or one already running followed (`job`); the new
 *  parts' outlines load when the house's partsFoundAt changes (reloadParts). */
async function runFind(options) {
  busy.value.find = true;
  try {
    await house.findParts(t("house.find.task", { name: isolate(house.house.name) }), findProgress, options);
  } catch (e) {
    if (e?.name !== "AbortError") onWriteRefused(e);
  } finally {
    busy.value.find = false;
  }
}

async function aiPhoto() {
  if (busy.value.ai || photoTask.value) return;
  if (!engines.aiphotoInstalled) {
    aiDialog.value = { render: null };
    return;
  }
  await runAiPhoto();
}

/** The AI photo of the colors on screen — or `job`, one already being made, followed; shown when done. */
async function runAiPhoto(job = null) {
  busy.value.ai = true;
  try {
    const render = await house.aiPhoto(t("house.ai.task", { name: isolate(house.house.name) }), { job });
    aiDialog.value = { render };
  } catch (e) {
    if (e?.name !== "AbortError") reportError(e);
  } finally {
    busy.value.ai = false;
  }
}

/** The house's name as a saved file's: the kit's safeTitle — without what a Windows file name can't hold
 *  (learn.microsoft.com/windows/win32/fileio/naming-a-file): "10/20" made a folder, ":" or "?" a name
 *  Windows refuses. */
const fileTitle = (name) => safeTitle(name, t("aiPhoto.fallbackName"));

/** The painted photo at full size — the original, at most the `photos.fullSizeMaxMegapixels` setting
 *  (Settings → General), the outlines scaled up, the same paint — painted in a Web Worker
 *  (services/fullSizeImage.js): the page stays responsive meanwhile, the button waiting. */
async function saveImage() {
  if (busy.value.export || !painter) return;
  busy.value.export = true;
  try {
    const { width: W, height: H, name } = house.house;
    const masks = order.value.map((key) => ({ key, mask: painter.mask(key) })).filter((m) => m.mask);
    const out = await paintFullSize({
      photo: await requestBlob(imagePath("original")),
      ...exportSize(W, H, settings.values["photos.fullSizeMaxMegapixels"]),
      masks,
      maskWidth: painter.width,
      maskHeight: painter.height,
      colors: hexOf(house.colors),
      order: [...order.value],
      light: light.value,
      current: currentHex(),
      texture: texture.value,
      quality: 0.92,
    });
    await saveBlob(out, `${fileTitle(name)} — ${t("house.export.suffix")}.jpg`, { title: t("house.export.save"), filterName: "JPEG", filterExt: "jpg" });
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
    await copyToClipboard(
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
    await saveBlob(out, `${fileTitle(house.house.name)} — ${t("colorCard.suffix")}.png`, { title: t("designs.colorCard"), filterName: "PNG", filterExt: "png" });
  } catch (e) {
    reportError(e);
  }
}

// why the AI photo can't run yet — shown beside the buttons (a disabled button can't take focus, so a
// tooltip on it never reaches the keyboard), and the button's description
const aiPhotoWhyNot = computed(() => {
  if (!house.parts.length) return t("house.ai.needParts");
  if (!house.paintableParts.length) return t("house.ai.needOutline");
  if (!hasColors.value) return t("house.ai.needColors");
  return "";
});
/** The AI photo installed from its dialog: the photo the user asked for is made at once. */
function onAiPhotoInstalled() {
  aiDialog.value = null;
  // only when it can run now: the card isn't busy with this house's parts, the install really landed
  const busyHere = finding.value || busy.value.ai || !!photoTask.value;
  if (engines.aiphotoInstalled && !busyHere && house.paintableParts.length && hasColors.value) aiPhoto();
}

const failedReason = computed(() => {
  if (!loadFailed.value) return "";
  const { title, detail } = errorMessage(loadFailed.value);
  return [title, detail].filter(Boolean).join(" — ");
});
// the outline tools, off (dimmed, saying why) while the parts are being found; the box also while the part finder,
// which outlines what is inside it, isn't installed (it was offered, and its two corners gave an error — the
// sixteenth review)
const editTool = (tool) => (finding.value ? { ...tool, title: t("house.tools.offWhileFinding"), disabled: true } : tool);
/** An off tool pressed: why it is off, said (its reason is its tooltip — a press on a touch screen shows none). */
const toolBlocked = (opt) => pushToast({ message: opt.title, kind: "info" });
const boxTool = (tool) => (engines.finderMissing ? { ...tool, title: t("house.tools.offNoFinder"), disabled: true } : editTool(tool));
const tools = computed(() => [
  { value: "look", label: t("house.tools.look"), title: t("house.tools.lookHint") },
  editTool({ value: "brush", label: t("house.tools.brush"), title: t("house.tools.brushHint") }),
  editTool({ value: "eraser", label: t("house.tools.eraser"), title: t("house.tools.eraserHint") }),
  boxTool({ value: "box", label: t("house.tools.box"), title: t("house.tools.boxHint") }),
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
// a paint on screen to copy (colors whose brand no longer has them, or on parts the house lost, copy nothing — the
// twenty-first review: "Color list copied" for an empty list)
const hasPainted = computed(() => paintedRows().length > 0);
const whyNotShown = computed(() => !!house.house && !!aiPhotoWhyNot.value);
const canRevert = computed(() => !!house.design && house.dirty);
</script>

<template>
  <q-page :style-fn="pageFill" class="page house">
    <PaneHeader :eyebrow="t('houses.title')" :title="house.house?.name || ''" help-key="painting">
      <UiButton intent="ghost" :label="t('house.back')" @click="router.push('/')" />
      <UiButton
        intent="secondary" :disabled="!house.house" v-bind="waiting(finding)"
        :label="house.parts.length ? t('house.find.again') : t('house.find.button')" @click="findParts"
      />
      <UiButton
        intent="secondary" :disabled="!house.paintableParts.length || !hasColors" v-bind="waiting(busy.ai || !!photoTask)"
        :aria-describedby="whyNotShown ? 'house-ai-why' : undefined" :label="t('house.ai.button')" @click="aiPhoto"
      />
      <UiButton intent="ghost" :disabled="!hasPainted" :label="t('house.export.copyList')" @click="copyColorList" />
      <UiButton intent="primary" :disabled="!painted" v-bind="waiting(busy.export)" :label="t('house.export.save')" @click="saveImage" />
      <span v-if="whyNotShown" id="house-ai-why" class="hint house__why">{{ t("house.ai.whyNot", { reason: aiPhotoWhyNot }) }}</span>
    </PaneHeader>
    <AiTaskStrip :task="findTask" />
    <AiTaskStrip :task="photoTask" />

    <EmptyState
      v-if="loadFailed && houseGone" icon="Home" :title="t('house.gone.title')" :message="t('house.gone.message')"
      :action-label="t('house.back')" @action="router.push('/')"
    />
    <UiBanner v-else-if="loadFailed" class="page__banner">
      {{ t("house.loadFailed", { reason: failedReason }) }}
      <template #action><UiButton intent="secondary" size="small" :label="t('kit.common.retry')" @click="load" /></template>
    </UiBanner>

    <div v-else-if="house.house" class="house__body">
      <!-- the photo's tools: above the photo in a wide window, across the photo and the panel in a
           narrow one (the styles' grid areas) -->
      <div class="house__toolbar">
        <div class="house__tools">
          <UiSegmented v-model="tool" :options="tools" :aria-label="t('house.tools.label')" @blocked="toolBlocked" />
          <label v-if="tool === 'brush' || tool === 'eraser'" class="house__tool">
            <span>{{ t("house.tools.size") }}</span>
            <UiSlider v-model="brushSize" :min="2" :max="120" :step="1" width="short" :aria-label="t('house.tools.size')" />
          </label>
          <span class="house__tool">
            <UiButton intent="secondary" size="small" :disabled="finding || !history.canUndo.value" :label="t('house.undo')" :title="finding ? t('house.undoOffWhileFinding') : t('house.undoHint')" @click="undo()" />
            <UiButton intent="secondary" size="small" :disabled="finding || !history.canRedo.value" :label="t('house.redo')" :title="finding ? t('house.undoOffWhileFinding') : t('house.redoHint')" @click="redo()" />
            <UiMenu
              :label="t('house.reset.label')" trigger-class="ui-btn ui-btn--secondary ui-btn--small"
              :disabled="!hasColors && !canRevert"
            >
              <template #trigger>{{ t("house.reset.button") }}</template>
              <UiMenuItem :disabled="!hasColors" @select="house.clearColors()">{{ t("house.reset.clear") }}</UiMenuItem>
              <!-- the design's name in a <bdi>: a right-to-left one keeps the sentence's quotes in place -->
              <UiMenuItem v-if="canRevert" @select="house.revertToDesign()">
                <i18n-t keypath="house.reset.revert" scope="global"><template #name><bdi>{{ house.design.name }}</bdi></template></i18n-t>
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
            <UiSelect v-model="compareWith" :options="compareOptions" width="fit" class="house__compare" :aria-label="t('house.compare.label')" />
          </span>
          <span v-if="compareGone" class="house__tool muted" role="status">{{ t("house.compare.notLoaded", { n: compareGone }, compareGone) }}</span>
          <label v-if="compareWith !== 'off'" class="house__tool house__side">
            <UiToggle v-model="sideBySide" :aria-label="t('house.compare.sideBySide')" />
            <span>{{ t("house.compare.sideBySide") }}</span>
          </label>
          <!-- its label shown (WCAG 3.3.2), short — the name starts with it (2.5.3) -->
          <label v-if="compareWith !== 'off' && !sideBySide" class="house__tool">
            <span>{{ t("house.tools.splitLabel") }}</span>
            <UiSlider v-model="split" :min="0" :max="1" :step="0.01" width="short" :show-number="false" :aria-label="t('house.tools.split')" />
          </label>
          <label class="house__tool">
            <span>{{ t("house.tools.texture") }}</span>
            <UiSlider
              :model-value="textureShown" :min="0" :max="1" :step="0.05" width="short" :aria-label="t('house.tools.texture')"
              @update:model-value="(v) => (textureShown = v)" @change="(v) => (texture = v)"
            />
          </label>
          <label class="house__tool" :title="t('house.tools.lightHint')">
            <span>{{ t("house.tools.light") }}</span>
            <UiSlider v-model="light" :min="0.5" :max="2" :step="0.05" width="short" :aria-label="t('house.tools.light')" />
          </label>
        </div>
      </div>
      <HouseCanvas
        class="house__canvas"
        :photo="photo" :painted="painted" :overlay="overlay" :before="before" :version="version"
        :split="compareWith !== 'off' ? split : null" :side-by-side="compareWith !== 'off' && sideBySide"
        :tool="tool" :brush-size="brushSize" :stroke-color="strokeColor"
        @pick="onPick" @stroke="onStroke" @box="onBox"
      />

      <aside class="house__panel">
        <UiTabStrip v-model="tab" :tabs="tabs" :aria-label="t('house.tabs.label')" />
        <div ref="panelScroller" class="house__tab">
          <template v-if="tab === 'parts'">
            <!-- the parts found stay listed (and paintable) when the finder was removed: it is needed only
                 to find them again or for a Box -->
            <PartsTab v-if="house.parts.length" :delta-e="deltaE" :photographed="photographed" @find-color="findColor" />
            <EngineInstallCard v-if="!engines.finderInstalled" kind="finder" />
            <EmptyState
              v-else-if="!house.parts.length && house.house.partsFoundAt" icon="Sparkle" :title="t('house.find.noneTitle')"
              :message="t('house.find.noneMessage')" :action-label="finding ? '' : t('house.find.again')" @action="findParts"
            />
            <EmptyState
              v-else-if="!house.parts.length" icon="Sparkle" :title="t('house.find.emptyTitle')" :message="t('house.find.emptyMessage')"
              :action-label="finding ? '' : t('house.find.button')" @action="findParts"
            />
          </template>
          <ColorsTab v-else-if="tab === 'colors'" :tones="tones" />
          <SchemesTab v-else-if="tab === 'schemes'" />
          <DesignsTab v-else @show-render="(r) => (aiDialog = { render: r })" @color-card="saveColorCard" />
        </div>
      </aside>
    </div>
    <q-inner-loading :showing="house.loading && !house.house" :label="t('kit.common.loading')" />

    <AiPhotoDialog
      v-if="aiDialog" :render="aiDialog.render" :house-name="house.house?.name || ''"
      @installed="onAiPhotoInstalled" @close="aiDialog = null"
    />
  </q-page>
</template>

<style scoped>
.house {
  display: flex;
  flex-direction: column;
}
/* A grid: the photo's tools over the photo, the panel beside both. The panel is 380 px on a wide
   window, down to 300 px as the page narrows (40 % of it): in an 800 px window the photo is 225 px
   wide instead of 160 (measured on the built app).
   In a narrow window (under Quasar's md breakpoint, 1024 px) the tools take the panel's width too:
   beside the panel they had 384 px at 960 × 700, wrapped onto six rows, and the page scrolled with
   the photo at its floor (the visual review, 2026-10-20); across the page they take three rows, the
   page doesn't scroll and the photo is 284 px tall (266 px with the AI photo's reason in the header,
   252 px with the brush's size) — measured on the built app. */
.house__body {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(300px, 40%, 380px);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas: "tools panel" "canvas panel";
  gap: var(--sp-2) var(--sp-3);
  min-height: 0;
}
@media (max-width: 1023.98px) {
  .house__body {
    grid-template-areas: "tools tools" "canvas panel";
  }
}
.house__toolbar {
  grid-area: tools;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
/* the photo never shrinks to nothing — 200 px at least (the visual review's floor, 2026-10-20): in a smaller
   window (a browser on the headless server; the desktop window's minimum, 960 × 700 —
   src-electron/electron-main.js — keeps the page whole) the page's scroller takes the rest. Its row
   is the room left (minmax(0, 1fr)), never its own content — the canvas the ResizeObserver sizes is
   that content, and at the floor the two fed each other ("ResizeObserver loop", measured) */
.house__canvas {
  grid-area: canvas;
  min-height: 200px;
}
/* a wrapped row of tools sits 8 px under the one above it: at 12 px the six rows of a narrow window
   (960 × 700) pushed the photo off the page — the page scrolled beside the panel's scroller (the
   visual review, 2026-10-20) */
.house__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
}
/* in a narrow window a control drops under its label, as wide as the row lets it */
.house__tool {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  max-width: 100%;
}
/* a control's label stays on one line ("Compare with" wrapped under the row's squeeze) */
.house__tool > span:first-child {
  white-space: nowrap;
  flex-shrink: 0;
}
/* Compare's choice as wide as what it shows, up to a name's width: at the name's width it was a
   full-width box that dropped under its label in a narrow window, a line of its own (the visual
   review at 960 × 700, 2026-10-20) */
.house__compare {
  max-width: min(100%, var(--w-name));
}
/* the five tools wrap onto a second line rather than run past a narrow photo */
.house__tools .ui-seg {
  flex-wrap: wrap;
  max-width: 100%;
}
/* the AI photo's reason, beside the header's buttons while it is off */
.house__why {
  margin: 0;
  max-width: 32ch;
}
/* never wider than its column for what it holds: its tab strip is one row now (it scrolls, the kit's
   UiTabStrip), and that row's width as a minimum held the panel at 329 px at 960 × 700 (measured) */
.house__panel {
  grid-area: panel;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--border);
  padding-left: calc(var(--sp-3) - 2px);
}
/* 2 px each side: a focused row's or chip's ring (the kit's --focus-ring) isn't cut by the scroller */
.house__tab {
  flex: 1 1 auto;
  overflow: auto;
  min-height: 0;
  padding: var(--sp-3) 2px 2px;
}
</style>
