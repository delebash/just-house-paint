<script setup>
// SPDX-License-Identifier: MIT
// The photo with the paint on it — the house page's canvas, on Konva (konvajs.org, MIT, through
// vue-konva): the painted image, the original beside it up to the before/after split, the parts'
// outlines, and the tools. Everything is in the display photo's pixels; the stage fits the photo
// to the space it has, the wheel zooms around the pointer and "look" drags to pan.
//   - look:   click a part to select it (`pick`), drag to pan;
//   - brush / eraser: drag to paint into / out of the selected part (`stroke` when the drag ends —
//     the page applies it to the mask, repaints and saves);
//   - box:    drag a box — or click one corner, then the other; the part finder outlines what is
//     inside (`box`).
// The keyboard reaches the photo itself (a Tab stop with a name): its arrow keys move it once zoomed,
// and with the box or Pick a color chosen they move a crosshair instead — Enter sets each corner of a
// box (or reads the color there), Escape lets go (WCAG 2.1.1; a box's two clicks are the single-pointer
// way WCAG 2.5.7 asks for a drag, the pan buttons a zoomed photo's). The brush and the eraser draw a
// path, which needs a pointer (2.1.1's own exception). The zoom buttons zoom around the middle.
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
// { x0, y0, x1, y1 } while a box is drawn; `armed` once a click set its first corner (the next click
// sets the other), `keys` while the keyboard draws it
const boxing = ref(null);
const pointer = ref(null);
// the keyboard's crosshair (the box's and Pick a color's), in the photo's pixels; null until a key moves it
const aim = ref(null);
// the view is the fitted one (no zoom or pan since): a resize fits it again; a zoomed view stays
const fitted = ref(true);

const imgW = computed(() => props.photo?.naturalWidth || props.photo?.width || 1);
const imgH = computed(() => props.photo?.naturalHeight || props.photo?.height || 1);
// side by side: the painted photo sits right of `before`, a small gap between (photo pixels)
const offsetX = computed(() => (props.sideBySide ? Math.round(imgW.value * 1.02) : 0));
const contentW = computed(() => offsetX.value + imgW.value);

/** Fit the photo (or both, side by side) inside the stage, centered. */
function fitToStage() {
  const s = Math.min(size.value.width / contentW.value, size.value.height / imgH.value) || 1;
  view.value = { scale: s, x: (size.value.width - contentW.value * s) / 2, y: (size.value.height - imgH.value * s) / 2 };
  fitted.value = true;
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
    if (fitted.value) fitToStage();
  });
  observer.observe(host.value);
  followPixelRatio();
  // the capture lost without a lift (a native menu, Alt+Tab): the stroke ends there — Konva fires no event of its
  // own for it, the DOM does (W3C Pointer Events, "lostpointercapture", which bubbles). Heard on the host, which is
  // always there: the stage is made only once there is a photo, after this — listened to on its container, it was
  // never heard (the sixteenth review)
  host.value.addEventListener("lostpointercapture", onLost);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  stopFollowingRatio?.();
  host.value?.removeEventListener("lostpointercapture", onLost);
});
// another photo (another house, opened with the button still down, or a photo landing mid-press): fitted, and
// whatever the pointer or the keys were doing on the old one goes — the pointer too, so its lifting paints nothing
// (a stroke begun on one house was saved onto the next — the seventeenth review)
watch(
  () => props.photo,
  () => {
    fitToStage();
    active = null;
    panFrom = null;
    boxing.value = null;
    drawing.value = null;
    aim.value = null;
  },
);
watch(() => props.sideBySide, fitToStage);
// another tool: a box half drawn and the crosshair go
watch(
  () => props.tool,
  () => {
    if (active === null) boxing.value = null;
    aim.value = null;
  },
);
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
  fitted.value = false;
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
  // the pointer takes over from the keyboard: its crosshair and a box it was drawing go
  aim.value = null;
  if (boxing.value?.keys) boxing.value = null;
  if (props.tool === "brush" || props.tool === "eraser") {
    if (inside(pt)) drawing.value = { points: [pt.x, pt.y], erase: eraserEnd || props.tool === "eraser" };
  } else if (props.tool === "box") {
    // a click set the first corner: this press sets the other (where it is let go)
    if (boxing.value?.armed && pt) boxing.value = { ...boxing.value, ...clamped(pt) };
    else if (inside(pt)) boxing.value = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, slop: e.evt.pointerType === "touch" ? TOUCH_SLOP : CLICK_SLOP };
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
  // the box follows the pointer while it is pressed, and after a first corner's click
  else if (boxing.value && pt && (active !== null || boxing.value.armed)) boxing.value = { ...boxing.value, ...clamped(pt) };
  else if (panFrom) {
    const dx = e.evt.clientX - panFrom.x;
    const dy = e.evt.clientY - panFrom.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) panFrom.moved = true;
    view.value = { ...panFrom.view, x: panFrom.view.x + dx, y: panFrom.view.y + dy };
    if (panFrom.moved) fitted.value = false;
  }
}
/** A point kept on the photo, as a box's second corner. */
const clamped = (pt) => ({ x1: Math.min(imgW.value, Math.max(0, pt.x)), y1: Math.min(imgH.value, Math.max(0, pt.y)) });
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
    // a click (let go within a few screen pixels of the press), not a drag: its corner waits for the next click
    const s = view.value.scale;
    const slop = b.slop ?? CLICK_SLOP;
    if (!b.armed && Math.abs(b.x1 - b.x0) * s < slop && Math.abs(b.y1 - b.y0) * s < slop) {
      boxing.value = { ...b, x1: b.x0, y1: b.y0, armed: true };
      return;
    }
    endBox();
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

// a press and its lifting this close (screen pixels) are a click, not a drag — the pan's own threshold; a finger's
// tap moves more (Android's touch slop is 8 dp — developer.android.com, ViewConfiguration.getScaledTouchSlop)
const CLICK_SLOP = 4;
const TOUCH_SLOP = 10;
/** The box drawn ends: one big enough (2 photo pixels each way) is asked for. */
function endBox() {
  const b = boxing.value;
  boxing.value = null;
  const box = { x0: Math.min(b.x0, b.x1), y0: Math.min(b.y0, b.y1), x1: Math.max(b.x0, b.x1), y1: Math.max(b.y0, b.y1) };
  if (box.x1 - box.x0 >= 2 && box.y1 - box.y0 >= 2) emit("box", box);
}

// the arrow keys move a zoomed (or moved) photo by this many screen pixels — a map's step (Leaflet's
// keyboardPanDelta); the photo fitted to the view has nowhere to go, and the keys scroll as usual
const PAN_STEP = 80;
// the crosshair's step (screen pixels), Shift's ten of them
const AIM_STEP = 8;
const PAN_KEYS = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
const pans = computed(() => [
  { key: "left", dir: PAN_KEYS.ArrowLeft, label: t("house.zoom.left"), hint: t("house.zoom.leftHint") },
  { key: "up", dir: PAN_KEYS.ArrowUp, label: t("house.zoom.up"), hint: t("house.zoom.upHint") },
  { key: "down", dir: PAN_KEYS.ArrowDown, label: t("house.zoom.down"), hint: t("house.zoom.downHint") },
  { key: "right", dir: PAN_KEYS.ArrowRight, label: t("house.zoom.right"), hint: t("house.zoom.rightHint") },
]);
const aiming = computed(() => props.tool === "box" || props.tool === "pick");
/** The pan buttons and the arrow keys: the photo moves a step — ← shows more of the left. */
function panBy([dx, dy]) {
  view.value = { ...view.value, x: view.value.x + dx * PAN_STEP, y: view.value.y + dy * PAN_STEP };
  fitted.value = false;
}
function onKey(e) {
  if (e.target !== host.value || e.altKey || e.ctrlKey || e.metaKey) return;
  if (aiming.value) return aimKey(e);
  const dir = PAN_KEYS[e.key];
  if (!dir || fitted.value) return;
  e.preventDefault();
  panBy(dir);
}
/** The keyboard's crosshair: the arrows move it (Shift: further), Enter or Space sets a box's corner
 *  (the second makes the box) or reads the color there, Escape lets go of a box, then of the crosshair. */
function aimKey(e) {
  const dir = PAN_KEYS[e.key];
  if (e.key === "Escape") {
    if (!boxing.value && !aim.value) return;
    // handled here: no dialog or page behind hears it
    e.preventDefault();
    e.stopPropagation();
    if (boxing.value) boxing.value = null;
    else aim.value = null;
    return;
  }
  if (!dir && e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  // Enter held down picks or sets a corner once, not on every repeat
  if (!dir && e.repeat) return;
  if (!aim.value) {
    // the first key shows the crosshair: where a box a click began has got to, or the middle of what is in view
    const s = view.value.scale;
    aim.value = boxing.value
      ? clampAim({ x: boxing.value.x1, y: boxing.value.y1 })
      : clampAim({ x: (size.value.width / 2 - view.value.x) / s - offsetX.value, y: (size.value.height / 2 - view.value.y) / s });
    takeOverBox();
    return;
  }
  if (dir) {
    const step = (e.shiftKey ? AIM_STEP * 10 : AIM_STEP) / view.value.scale;
    aim.value = clampAim({ x: aim.value.x - dir[0] * step, y: aim.value.y - dir[1] * step });
    takeOverBox();
    keepAimInView();
    return;
  }
  takeOverBox();
  const { x, y } = aim.value;
  if (props.tool === "pick") emit("pick", { x: Math.min(imgW.value - 1, Math.floor(x)), y: Math.min(imgH.value - 1, Math.floor(y)) });
  else if (!boxing.value) boxing.value = { x0: x, y0: y, x1: x, y1: y, keys: true };
  // the second corner: a box with no size yet waits for the crosshair to move
  else if (Math.abs(boxing.value.x1 - boxing.value.x0) >= 2 && Math.abs(boxing.value.y1 - boxing.value.y0) >= 2) endBox();
}
const clampAim = (pt) => ({ x: Math.min(imgW.value, Math.max(0, pt.x)), y: Math.min(imgH.value, Math.max(0, pt.y)) });
/** A box being drawn follows the crosshair from now on — one a click began too (it ended at the pointer, not the
 *  crosshair — the sixteenth review). */
function takeOverBox() {
  if (boxing.value) boxing.value = { ...boxing.value, keys: true, armed: false, x1: aim.value.x, y1: aim.value.y };
}
/** A zoomed photo moves with the crosshair once it would leave the view, bringing it back a little way in
 *  (a fitted photo is all in view: it never moves). */
function keepAimInView() {
  const s = view.value.scale;
  const sx = view.value.x + (offsetX.value + aim.value.x) * s;
  const sy = view.value.y + aim.value.y * s;
  const m = AIM_STEP * 4;
  let { x, y } = view.value;
  if (sx < 0) x += m - sx;
  else if (sx > size.value.width) x -= sx - (size.value.width - m);
  if (sy < 0) y += m - sy;
  else if (sy > size.value.height) y -= sy - (size.value.height - m);
  if (x !== view.value.x || y !== view.value.y) {
    view.value = { ...view.value, x, y };
    fitted.value = false;
  }
}
const keysHint = computed(() => {
  if (props.tool === "box") return t("house.canvas.keysBox");
  if (props.tool === "pick") return t("house.canvas.keysPick");
  return t("house.canvas.keys");
});

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
// the keyboard's crosshair: a plus, 24 screen pixels across, white over a black edge
const aimMarks = computed(() => {
  const a = aim.value;
  if (!a || !aiming.value) return [];
  const r = 12 / view.value.scale;
  const w = 2 / view.value.scale;
  const [hEdge, h] = twoTone({ points: [a.x - r, a.y, a.x + r, a.y], stroke: "#ffffff", strokeWidth: w }, 2);
  const [vEdge, v] = twoTone({ points: [a.x, a.y - r, a.x, a.y + r], stroke: "#ffffff", strokeWidth: w }, 2);
  // both edges under both strokes: the second edge never crosses the first stroke
  return [hEdge, vEdge, h, v];
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
    <span v-if="photo" :id="keysId" class="visually-hidden">{{ keysHint }}</span>
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
            <v-line v-for="(m, i) in aimMarks" :key="`aim${i}`" :config="m" />
          </v-group>
        </v-group>
      </v-layer>
    </v-stage>
    <div v-if="photo" class="house-canvas__zoom">
      <UiButton v-tooltip="t('house.zoom.outHint')" intent="secondary" size="small" :label="t('house.zoom.out')" :aria-label="t('house.zoom.outHint')" @click="zoomBy(1 / 1.25)" />
      <UiButton v-tooltip="t('house.zoom.inHint')" intent="secondary" size="small" :label="t('house.zoom.in')" :aria-label="t('house.zoom.inHint')" @click="zoomBy(1.25)" />
      <UiButton v-tooltip="t('house.zoom.fitHint')" intent="secondary" size="small" :label="t('house.zoom.fit')" @click="fitToStage" />
      <!-- a moved or zoomed photo moves by a step with these too: the drag's single-pointer way (WCAG 2.5.7) -->
      <template v-if="!fitted">
        <UiButton
          v-for="p in pans" :key="p.key" v-tooltip="p.hint" intent="secondary" size="small"
          :label="p.label" :aria-label="p.hint" @click="panBy(p.dir)"
        />
      </template>
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
