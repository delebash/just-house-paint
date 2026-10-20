<script setup>
// SPDX-License-Identifier: MIT
// The photo with the paint on it — the house page's canvas, on Konva (konvajs.org, MIT, through
// vue-konva): the painted image, the original beside it up to the before/after split, the parts'
// outlines, and the tools. Everything is in the display photo's pixels; the stage fits the photo
// to the space it has, the wheel zooms around the pointer and "look" drags to pan.
//   - look:   click a part to select it (`pick`), drag to pan;
//   - brush / eraser: drag to paint into / out of the selected part (`stroke` when the drag ends —
//     the page applies it to the mask, repaints and saves);
//   - box:    drag a box; the part finder outlines what is inside (`box`).
// Drawing stays pointer-only, as in every paint app; the keyboard reaches the photo itself (a Tab
// stop with a name), whose arrow keys move it once zoomed — the zoom buttons zoom around its middle.
// The mouse, a pen and touch are one thing here — Pointer Events (w3.org/TR/pointerevents3, through
// Konva's pointer events): one pointer draws, boxes or pans at a time (a second finger never paints),
// and a pointer the system takes back (pointercancel: a palm set down, an edge swipe) drops its stroke.
// Every light mark (the brush's ring, the box, the split line) has a dark copy drawn under it, the
// two-tone edge selection tools use, so it shows on a white wall as on a dark one.
import { UiButton } from "@delebash/ui";
import { parse, wcagLuminance } from "culori";
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  // display-size sources (HTMLImageElement / HTMLCanvasElement); `painted` null = the photo alone
  photo: { type: Object, default: null },
  painted: { type: Object, default: null },
  overlay: { type: Object, default: null },
  // bumps when `painted` or `overlay` was redrawn in place
  version: { type: Number, default: 0 },
  // 0–1: `before` (the photo as taken, or another design) shows left of this fraction; null = no split
  split: { type: Number, default: null },
  before: { type: Object, default: null },
  // `before` and the painted photo next to each other (one zoom, one pan) instead of the split line;
  // the tools work on the painted one, on the right
  sideBySide: { type: Boolean, default: false },
  tool: { type: String, default: "look" },
  brushSize: { type: Number, default: 20 },
  // the brush's color while drawing (the selected part's paint, or the outline color)
  strokeColor: { type: String, default: "#ffcc00" },
});
const emit = defineEmits(["pick", "stroke", "box"]);
const { t } = useI18n();
// the photo's keyboard hint, read with its name
const keysId = useId();

const host = ref(null);
const stage = ref(null);
const size = ref({ width: 300, height: 200 });
const view = ref({ scale: 1, x: 0, y: 0 });
const drawing = ref(null); // { points: [x, y, …] } while a stroke runs
const boxing = ref(null); // { x0, y0, x1, y1 } while a box is drawn
const pointer = ref(null);
// the view is the fitted one (no zoom or pan since): a resize fits it again; a zoomed view stays
let fitted = true;

const imgW = computed(() => props.photo?.naturalWidth || props.photo?.width || 1);
const imgH = computed(() => props.photo?.naturalHeight || props.photo?.height || 1);
// side by side: the painted photo sits right of `before`, a small gap between (photo pixels)
const offsetX = computed(() => (props.sideBySide ? Math.round(imgW.value * 1.02) : 0));
const contentW = computed(() => offsetX.value + imgW.value);

/** Fit the photo (or both, side by side) inside the stage, centered. */
function fitToStage() {
  const s = Math.min(size.value.width / contentW.value, size.value.height / imgH.value) || 1;
  view.value = { scale: s, x: (size.value.width - contentW.value * s) / 2, y: (size.value.height - imgH.value * s) / 2 };
  fitted = true;
}
/** The zoom buttons: by a step around the middle of the view. */
const zoomBy = (factor) => zoomAt(view.value.scale * factor, size.value.width / 2, size.value.height / 2);
defineExpose({ fit: fitToStage, zoomBy, zoomTo100: () => zoomAt(1, size.value.width / 2, size.value.height / 2, true) });

// The screen's pixel ratio, followed. Konva reads window.devicePixelRatio once, as it loads
// (Konva.pixelRatio): a window moved to a sharper screen, or zoomed, kept drawing the photo at the old
// ratio — blurry. A change is heard as MDN shows it (a resolution query for the ratio now, asked anew
// after each change — developer.mozilla.org/docs/Web/API/Window/devicePixelRatio, "Monitoring screen
// resolution or zoom level changes"), and each layer's canvas takes the new one (Konva's
// Canvas#setPixelRatio — konvajs.org/api/Konva.Canvas.html) and draws again.
let stopFollowingRatio = null;
function followPixelRatio() {
  stopFollowingRatio?.();
  applyPixelRatio();
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  query.addEventListener("change", followPixelRatio);
  stopFollowingRatio = () => query.removeEventListener("change", followPixelRatio);
}
/** The stage's layers at the screen's ratio now — also a stage made after a change (the photo shown again). */
function applyPixelRatio() {
  const ratio = window.devicePixelRatio || 1;
  for (const layer of stage.value?.getNode()?.getLayers() || []) {
    if (layer.getCanvas().getPixelRatio() === ratio) continue;
    layer.getCanvas().setPixelRatio(ratio);
    layer.batchDraw();
  }
}
watch(stage, applyPixelRatio, { flush: "post" });

let observer = null;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const r = entry.contentRect;
    size.value = { width: Math.max(1, Math.floor(r.width)), height: Math.max(1, Math.floor(r.height)) };
    if (fitted) fitToStage();
  });
  observer.observe(host.value);
  followPixelRatio();
  // the capture lost without a lift (a native menu, Alt+Tab): the stroke ends there — Konva fires no event of its
  // own for it, the DOM does (W3C Pointer Events, "lostpointercapture"; it bubbles to the stage's container)
  stage.value?.getNode()?.container?.()?.addEventListener("lostpointercapture", onLost);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  stopFollowingRatio?.();
  stage.value?.getNode()?.container?.()?.removeEventListener("lostpointercapture", onLost);
});
watch(() => props.photo, fitToStage);
watch(() => props.sideBySide, fitToStage);
watch(
  () => props.version,
  () => stage.value?.getNode()?.batchDraw(),
);

/** The pointer in the painted photo's pixels (side by side: the one on the right). */
function photoPoint() {
  const p = stage.value?.getNode()?.getPointerPosition();
  if (!p) return null;
  return { x: (p.x - view.value.x) / view.value.scale - offsetX.value, y: (p.y - view.value.y) / view.value.scale };
}
const inside = (pt) => pt && pt.x >= 0 && pt.y >= 0 && pt.x < imgW.value && pt.y < imgH.value;

function zoomAt(newScale, px, py, absolute = false) {
  const s = Math.min(16, Math.max(0.05, absolute ? newScale : newScale));
  const old = view.value;
  const ix = (px - old.x) / old.scale;
  const iy = (py - old.y) / old.scale;
  view.value = { scale: s, x: px - ix * s, y: py - iy * s };
  fitted = false;
}

function onWheel(e) {
  e.evt.preventDefault();
  const p = stage.value.getNode().getPointerPosition();
  const factor = e.evt.deltaY > 0 ? 1 / 1.15 : 1.15;
  zoomAt(view.value.scale * factor, p.x, p.y);
}

let panFrom = null;
// the pointer drawing, boxing or panning now (its pointerId), null when none: any other — a second
// finger, a pen set down meanwhile — is ignored until it is lifted
let active = null;
const ours = (e) => e.evt.pointerId === active;
function onDown(e) {
  if (active !== null) return;
  // the primary button only — a mouse's left, a finger, a pen's tip — or a pen's eraser end (button 5, W3C Pointer
  // Events' "button" table): a right click, a middle click or a pen's barrel button never paints
  const eraserEnd = e.evt.pointerType === "pen" && e.evt.button === 5;
  if (e.evt.button !== 0 && !eraserEnd) return;
  const pt = photoPoint();
  if (props.tool === "brush" || props.tool === "eraser") {
    if (inside(pt)) drawing.value = { points: [pt.x, pt.y], erase: eraserEnd || props.tool === "eraser" };
  } else if (props.tool === "box") {
    if (inside(pt)) boxing.value = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
  } else {
    panFrom = { x: e.evt.clientX, y: e.evt.clientY, view: { ...view.value }, moved: false };
  }
  if (!drawing.value && !boxing.value && !panFrom) return;
  active = e.evt.pointerId;
  // its moves and its lifting reach the stage off the canvas too (Element.setPointerCapture —
  // developer.mozilla.org/docs/Web/API/Element/setPointerCapture — through Konva's, which routes them)
  stage.value.getNode().setPointerCapture(active);
}
function onMove(e) {
  if (active !== null && !ours(e)) return;
  const pt = photoPoint();
  pointer.value = pt;
  if (drawing.value && pt) drawing.value = { ...drawing.value, points: [...drawing.value.points, pt.x, pt.y] };
  else if (boxing.value && pt) boxing.value = { ...boxing.value, x1: Math.min(imgW.value, Math.max(0, pt.x)), y1: Math.min(imgH.value, Math.max(0, pt.y)) };
  else if (panFrom) {
    const dx = e.evt.clientX - panFrom.x;
    const dy = e.evt.clientY - panFrom.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) panFrom.moved = true;
    view.value = { ...panFrom.view, x: panFrom.view.x + dx, y: panFrom.view.y + dy };
    if (panFrom.moved) fitted = false;
  }
}
function onUp(e) {
  if (ours(e)) finish();
}
/** The system took the pointer back (pointercancel — a palm set down, an edge swipe, the browser's own
 *  gesture): what it was drawing is dropped, not painted — the press wasn't the user's stroke; a box
 *  isn't asked for, a pan stays where it got to and picks nothing. */
function onCancel(e) {
  if (!ours(e)) return;
  active = null;
  drawing.value = null;
  boxing.value = null;
  panFrom = null;
}
/** The pointer's capture lost while it drew (no pointerup will come): what it drew so far is its stroke. */
function onLost(evt) {
  if (active !== null && evt.pointerId === active) finish();
}
function finish() {
  active = null;
  if (drawing.value) {
    const p = drawing.value.points;
    const points = [];
    for (let i = 0; i < p.length; i += 2) points.push({ x: p[i], y: p[i + 1] });
    emit("stroke", { points, radius: props.brushSize / 2, mode: drawing.value.erase ? "erase" : "paint" });
    drawing.value = null;
  } else if (boxing.value) {
    const b = boxing.value;
    const box = { x0: Math.min(b.x0, b.x1), y0: Math.min(b.y0, b.y1), x1: Math.max(b.x0, b.x1), y1: Math.max(b.y0, b.y1) };
    boxing.value = null;
    if (box.x1 - box.x0 >= 2 && box.y1 - box.y0 >= 2) emit("box", box);
  } else if (panFrom) {
    const clicked = !panFrom.moved;
    panFrom = null;
    const pt = photoPoint();
    if (clicked && inside(pt)) emit("pick", { x: Math.floor(pt.x), y: Math.floor(pt.y) });
  }
}

/** The pointer left the canvas: the brush's ring goes. A captured pointer is heard off the canvas and
 *  leaves only once it is lifted; one that leaves while it draws (the capture didn't take) ends its
 *  stroke, box or pan there — its button may be let go outside, where the canvas never hears it. */
function onLeave(e) {
  if (active !== null && !ours(e)) return;
  pointer.value = null;
  if (active !== null) finish();
}

// the arrow keys move a zoomed (or moved) photo by this many screen pixels — a map's step (Leaflet's
// keyboardPanDelta); the photo fitted to the view has nowhere to go, and the keys scroll as usual
const PAN_STEP = 80;
const PAN_KEYS = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
function onKey(e) {
  const dir = PAN_KEYS[e.key];
  if (!dir || fitted || e.target !== host.value || e.altKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  view.value = { ...view.value, x: view.value.x + dir[0] * PAN_STEP, y: view.value.y + dir[1] * PAN_STEP };
}

const imageConfig = computed(() => ({ image: props.painted || props.photo, width: imgW.value, height: imgH.value }));
const beforeClip = computed(() => (props.split === null || props.sideBySide ? null : { x: 0, y: 0, width: imgW.value * props.split, height: imgH.value }));
const groupConfig = computed(() => ({ x: view.value.x, y: view.value.y, scaleX: view.value.scale, scaleY: view.value.scale }));
/** A mark and the edge drawn under it: the same shape, solid (a dashed mark's gaps show it — the
 *  two-tone "marching ants"), `widen` screen pixels wider, in `edge` — black under a light mark. */
const twoTone = (mark, widen, edge = "#000000") =>
  mark ? [{ ...mark, stroke: edge, dash: undefined, strokeWidth: mark.strokeWidth + widen / view.value.scale }, mark] : [];
// the brush's preview is the paint (or the eraser's black): its edge is black under a light paint,
// white under a dark one (0.18: the luminance black and white contrast equally with), so the stroke
// shows on any wall
const edgeOf = (hex) => (wcagLuminance(parse(hex) || "#000000") > 0.18 ? "#000000" : "#ffffff");

const cursorMarks = computed(() =>
  twoTone(
    pointer.value && (props.tool === "brush" || props.tool === "eraser") && inside(pointer.value)
      ? { x: pointer.value.x, y: pointer.value.y, radius: props.brushSize / 2, stroke: "#ffffff", strokeWidth: 1.5 / view.value.scale, dash: [4 / view.value.scale, 3 / view.value.scale] }
      : null,
    1,
  ),
);
const lineMarks = computed(() => {
  if (!drawing.value) return [];
  const stroke = props.tool === "eraser" ? "#000000" : props.strokeColor;
  const line = { points: drawing.value.points, stroke, strokeWidth: props.brushSize, lineCap: "round", lineJoin: "round", opacity: 0.55 };
  return twoTone(line, 2, edgeOf(stroke));
});
const boxMarks = computed(() => {
  const b = boxing.value;
  return twoTone(
    b
      ? { x: Math.min(b.x0, b.x1), y: Math.min(b.y0, b.y1), width: Math.abs(b.x1 - b.x0), height: Math.abs(b.y1 - b.y0), stroke: "#ffffff", strokeWidth: 2 / view.value.scale, dash: [6 / view.value.scale, 4 / view.value.scale] }
      : null,
    1,
  );
});
const splitMarks = computed(() =>
  twoTone(props.split === null || props.sideBySide ? null : { points: [imgW.value * props.split, 0, imgW.value * props.split, imgH.value], stroke: "#ffffff", strokeWidth: 2 / view.value.scale }, 2),
);
</script>

<template>
  <div
    ref="host" class="house-canvas" :data-tool="tool" :tabindex="photo ? 0 : undefined" :role="photo ? 'region' : undefined"
    :aria-label="photo ? t('house.canvas.label') : undefined" :aria-describedby="photo ? keysId : undefined" @keydown="onKey"
  >
    <span v-if="photo" :id="keysId" class="visually-hidden">{{ t("house.canvas.keys") }}</span>
    <v-stage
      v-if="photo" ref="stage" :config="{ width: size.width, height: size.height }"
      @wheel="onWheel" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onCancel"
      @pointerleave="onLeave"
    >
      <v-layer>
        <v-group :config="groupConfig">
          <!-- side by side: the photo as taken (or a design) on the left -->
          <v-image v-if="sideBySide" :config="{ image: before || photo, width: imgW, height: imgH }" />
          <v-group :config="{ x: offsetX }">
            <v-image :config="imageConfig" />
            <v-group v-if="beforeClip" :config="{ clip: beforeClip }">
              <v-image :config="{ image: before || photo, width: imgW, height: imgH }" />
            </v-group>
            <v-image v-if="overlay" :config="{ image: overlay, width: imgW, height: imgH, listening: false }" />
            <v-line v-for="(m, i) in splitMarks" :key="`split${i}`" :config="m" />
            <v-line v-for="(m, i) in lineMarks" :key="`line${i}`" :config="m" />
            <v-rect v-for="(m, i) in boxMarks" :key="`box${i}`" :config="m" />
            <v-circle v-for="(m, i) in cursorMarks" :key="`cursor${i}`" :config="m" />
          </v-group>
        </v-group>
      </v-layer>
    </v-stage>
    <div v-if="photo" class="house-canvas__zoom">
      <UiButton intent="secondary" size="small" :label="t('house.zoom.out')" :title="t('house.zoom.outHint')" :aria-label="t('house.zoom.outHint')" @click="zoomBy(1 / 1.25)" />
      <UiButton intent="secondary" size="small" :label="t('house.zoom.in')" :title="t('house.zoom.inHint')" :aria-label="t('house.zoom.inHint')" @click="zoomBy(1.25)" />
      <UiButton intent="secondary" size="small" :label="t('house.zoom.fit')" :title="t('house.zoom.fitHint')" @click="fitToStage" />
    </div>
  </div>
</template>

<style scoped>
.house-canvas {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-sunken, #1d1d1d);
  /* a finger on the photo draws, boxes or pans it — the page's own panning and zooming never take it
     (touch-action — developer.mozilla.org/docs/Web/CSS/touch-action: with them, the browser takes the
     pointer back, pointercancel, as soon as a finger moves) */
  touch-action: none;
}
.house-canvas[data-tool="look"] {
  cursor: grab;
}
.house-canvas[data-tool="brush"],
.house-canvas[data-tool="eraser"] {
  cursor: none;
}
.house-canvas[data-tool="box"],
.house-canvas[data-tool="pick"] {
  cursor: crosshair;
}
/* on a panel of the app's own surface, as map zoom controls are: the buttons' text stays readable
   over the dark backdrop and any photo, in either theme */
.house-canvas__zoom {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-2);
}
</style>
