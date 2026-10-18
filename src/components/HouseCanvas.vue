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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps({
  // display-size sources (HTMLImageElement / HTMLCanvasElement); `painted` null = the photo alone
  photo: { type: Object, default: null },
  painted: { type: Object, default: null },
  overlay: { type: Object, default: null },
  // bumps when `painted` or `overlay` was redrawn in place
  version: { type: Number, default: 0 },
  // 0–1: the original shows left of this fraction; null = no split
  split: { type: Number, default: null },
  tool: { type: String, default: "look" },
  brushSize: { type: Number, default: 20 },
  // the brush's color while drawing (the selected part's paint, or the outline color)
  strokeColor: { type: String, default: "#ffcc00" },
});
const emit = defineEmits(["pick", "stroke", "box"]);

const host = ref(null);
const stage = ref(null);
const size = ref({ width: 300, height: 200 });
const view = ref({ scale: 1, x: 0, y: 0 });
const drawing = ref(null); // { points: [x, y, …] } while a stroke runs
const boxing = ref(null); // { x0, y0, x1, y1 } while a box is drawn
const pointer = ref(null);

const imgW = computed(() => props.photo?.naturalWidth || props.photo?.width || 1);
const imgH = computed(() => props.photo?.naturalHeight || props.photo?.height || 1);

/** Fit the photo inside the stage, centered. */
function fitToStage() {
  const s = Math.min(size.value.width / imgW.value, size.value.height / imgH.value) || 1;
  view.value = { scale: s, x: (size.value.width - imgW.value * s) / 2, y: (size.value.height - imgH.value * s) / 2 };
}
defineExpose({ fit: fitToStage, zoomTo100: () => zoomAt(1, size.value.width / 2, size.value.height / 2, true) });

let observer = null;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const r = entry.contentRect;
    size.value = { width: Math.max(1, Math.floor(r.width)), height: Math.max(1, Math.floor(r.height)) };
    fitToStage();
  });
  observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.photo, fitToStage);
watch(
  () => props.version,
  () => stage.value?.getNode()?.batchDraw(),
);

/** The pointer in photo pixels. */
function photoPoint() {
  const p = stage.value?.getNode()?.getPointerPosition();
  if (!p) return null;
  return { x: (p.x - view.value.x) / view.value.scale, y: (p.y - view.value.y) / view.value.scale };
}
const inside = (pt) => pt && pt.x >= 0 && pt.y >= 0 && pt.x < imgW.value && pt.y < imgH.value;

function zoomAt(newScale, px, py, absolute = false) {
  const s = Math.min(16, Math.max(0.05, absolute ? newScale : newScale));
  const old = view.value;
  const ix = (px - old.x) / old.scale;
  const iy = (py - old.y) / old.scale;
  view.value = { scale: s, x: px - ix * s, y: py - iy * s };
}

function onWheel(e) {
  e.evt.preventDefault();
  const p = stage.value.getNode().getPointerPosition();
  const factor = e.evt.deltaY > 0 ? 1 / 1.15 : 1.15;
  zoomAt(view.value.scale * factor, p.x, p.y);
}

let panFrom = null;
function onDown(e) {
  const pt = photoPoint();
  if (props.tool === "brush" || props.tool === "eraser") {
    if (inside(pt)) drawing.value = { points: [pt.x, pt.y] };
  } else if (props.tool === "box") {
    if (inside(pt)) boxing.value = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
  } else {
    panFrom = { x: e.evt.clientX, y: e.evt.clientY, view: { ...view.value }, moved: false };
  }
}
function onMove(e) {
  const pt = photoPoint();
  pointer.value = pt;
  if (drawing.value && pt) drawing.value = { points: [...drawing.value.points, pt.x, pt.y] };
  else if (boxing.value && pt) boxing.value = { ...boxing.value, x1: Math.min(imgW.value, Math.max(0, pt.x)), y1: Math.min(imgH.value, Math.max(0, pt.y)) };
  else if (panFrom) {
    const dx = e.evt.clientX - panFrom.x;
    const dy = e.evt.clientY - panFrom.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) panFrom.moved = true;
    view.value = { ...panFrom.view, x: panFrom.view.x + dx, y: panFrom.view.y + dy };
  }
}
function onUp() {
  if (drawing.value) {
    const p = drawing.value.points;
    const points = [];
    for (let i = 0; i < p.length; i += 2) points.push({ x: p[i], y: p[i + 1] });
    emit("stroke", { points, radius: props.brushSize / 2, mode: props.tool === "eraser" ? "erase" : "paint" });
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

const imageConfig = computed(() => ({ image: props.painted || props.photo, width: imgW.value, height: imgH.value }));
const beforeClip = computed(() => (props.split === null ? null : { x: 0, y: 0, width: imgW.value * props.split, height: imgH.value }));
const groupConfig = computed(() => ({ x: view.value.x, y: view.value.y, scaleX: view.value.scale, scaleY: view.value.scale }));
const cursorConfig = computed(() =>
  pointer.value && (props.tool === "brush" || props.tool === "eraser") && inside(pointer.value)
    ? { x: pointer.value.x, y: pointer.value.y, radius: props.brushSize / 2, stroke: "#ffffff", strokeWidth: 1.5 / view.value.scale, dash: [4 / view.value.scale, 3 / view.value.scale] }
    : null,
);
const lineConfig = computed(() =>
  drawing.value
    ? {
        points: drawing.value.points,
        stroke: props.tool === "eraser" ? "#000000" : props.strokeColor,
        strokeWidth: props.brushSize,
        lineCap: "round",
        lineJoin: "round",
        opacity: 0.55,
      }
    : null,
);
const boxConfig = computed(() => {
  const b = boxing.value;
  return b
    ? { x: Math.min(b.x0, b.x1), y: Math.min(b.y0, b.y1), width: Math.abs(b.x1 - b.x0), height: Math.abs(b.y1 - b.y0), stroke: "#ffffff", strokeWidth: 2 / view.value.scale, dash: [6 / view.value.scale, 4 / view.value.scale] }
    : null;
});
const splitLine = computed(() => (props.split === null ? null : { points: [imgW.value * props.split, 0, imgW.value * props.split, imgH.value], stroke: "#ffffff", strokeWidth: 2 / view.value.scale }));
</script>

<template>
  <div ref="host" class="house-canvas" :data-tool="tool">
    <v-stage
      v-if="photo" ref="stage" :config="{ width: size.width, height: size.height }"
      @wheel="onWheel" @mousedown="onDown" @touchstart="onDown" @mousemove="onMove" @touchmove="onMove"
      @mouseup="onUp" @touchend="onUp" @mouseleave="pointer = null"
    >
      <v-layer>
        <v-group :config="groupConfig">
          <v-image :config="imageConfig" />
          <v-group v-if="beforeClip" :config="{ clip: beforeClip }">
            <v-image :config="{ image: photo, width: imgW, height: imgH }" />
          </v-group>
          <v-image v-if="overlay" :config="{ image: overlay, width: imgW, height: imgH, listening: false }" />
          <v-line v-if="splitLine" :config="splitLine" />
          <v-line v-if="lineConfig" :config="lineConfig" />
          <v-rect v-if="boxConfig" :config="boxConfig" />
          <v-circle v-if="cursorConfig" :config="cursorConfig" />
        </v-group>
      </v-layer>
    </v-stage>
  </div>
</template>

<style scoped>
.house-canvas {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-sunken, #1d1d1d);
}
.house-canvas[data-tool="look"] {
  cursor: grab;
}
.house-canvas[data-tool="brush"],
.house-canvas[data-tool="eraser"] {
  cursor: none;
}
.house-canvas[data-tool="box"] {
  cursor: crosshair;
}
</style>
