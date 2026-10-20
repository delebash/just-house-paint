// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The house page's canvas mounted for real, with Konva's shapes stood in for (jsdom has no canvas:
// each vue-konva component renders nothing and keeps its `config`). It proves the keyboard way to
// the photo — a Tab stop with a name and a hint, whose arrow keys move it once zoomed and never
// when it is fitted — that every light mark (the brush's ring, its stroke, the box, the split
// line) has a contrasting edge drawn under it, so it shows on a white house; that one pointer draws
// at a time and a cancelled one drops its stroke; and that the canvas follows the screen's pixel ratio.
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h } from "vue";
import { i18n } from "../i18n/index.js";
import HouseCanvas from "./HouseCanvas.vue";

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

// where the stand-in stage says the pointer is (screen pixels)
let pointerAt = { x: 50, y: 40 };
// the stand-in stage's one layer (its canvas's pixel ratio, its redraws) and the pointers it captured
let layer;
let captured;
// the stand-in stage's container (where the DOM's lostpointercapture arrives)
let container;
const newLayer = () => {
  const canvas = { ratio: 1, getPixelRatio: () => canvas.ratio, setPixelRatio: (r) => (canvas.ratio = r) };
  return { canvas, draws: 0, getCanvas: () => canvas, batchDraw: () => layer.draws++ };
};
const shape = (name) => ({ name, props: ["config"], render() { return h("i", { "data-shape": name }, this.$slots.default?.()); } });
const KONVA = {
  "v-stage": {
    name: "v-stage",
    props: ["config"],
    methods: { getNode: () => ({ getPointerPosition: () => pointerAt, batchDraw() {}, getLayers: () => [layer], setPointerCapture: (id) => captured.push(id), container: () => container }) },
    render() { return h("div", { class: "stage-stub" }, this.$slots.default?.()); },
  },
  "v-layer": shape("v-layer"),
  "v-group": shape("v-group"),
  "v-image": shape("v-image"),
  "v-line": shape("v-line"),
  "v-rect": shape("v-rect"),
  "v-circle": shape("v-circle"),
};

let wrapper;
function mountCanvas(props = {}) {
  wrapper = mount(HouseCanvas, {
    attachTo: document.body,
    props: { photo: { width: 100, height: 80 }, ...props },
    global: {
      plugins: [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n],
      components: KONVA,
      directives: { tooltip: {} },
    },
  });
  return wrapper;
}
const configs = (name) => wrapper.findAllComponents({ name }).map((c) => c.props("config"));
// the outer group carries the view: where the photo sits and how big
const view = () => configs("v-group")[0];
const stage = () => wrapper.findComponent({ name: "v-stage" });
const key = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

// the resolution queries asked (window.matchMedia), each with its change listeners
let queries;
beforeEach(() => {
  pointerAt = { x: 50, y: 40 };
  layer = newLayer();
  captured = [];
  container = document.createElement("div");
  queries = [];
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (media) => {
    const q = { media, listeners: new Set(), addEventListener: (_, f) => q.listeners.add(f), removeEventListener: (_, f) => q.listeners.delete(f) };
    queries.push(q);
    return q;
  });
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
// a Konva pointer event on the stage: pointer 1 (a mouse) unless told
const fire = (type, evt = {}) => stage().vm.$emit(type, { evt: { pointerId: 1, pointerType: "mouse", button: 0, clientX: 0, clientY: 0, ...evt } });

test("the photo is a Tab stop with a name, and its hint says the keys and that drawing needs a pointer", () => {
  const host = mountCanvas().find(".house-canvas").element;
  expect(host.getAttribute("tabindex")).toBe("0");
  expect(host.getAttribute("role")).toBe("region");
  expect(host.getAttribute("aria-label")).toBe("The photo of the house");
  const hint = document.getElementById(host.getAttribute("aria-describedby"));
  expect(hint.textContent).toContain("the arrow keys move it");
  expect(hint.textContent).toContain("need a mouse, a pen or touch");
  expect(hint.classList.contains("visually-hidden")).toBe(true);
  // no photo yet: nothing to reach
  wrapper.unmount();
  const empty = mountCanvas({ photo: null }).find(".house-canvas").element;
  expect(empty.hasAttribute("tabindex")).toBe(false);
});

test("the arrow keys move the photo once it is zoomed — never the fitted one, never from its buttons", async () => {
  const host = mountCanvas().find(".house-canvas").element;
  const fitted = { ...view() };
  // fitted: the keys are left alone (the page may scroll with them)
  expect(key(host, "ArrowLeft")).toBe(true);
  await flushPromises();
  expect(view()).toEqual(fitted);
  // zoomed in with its button (around the middle), the arrows move it a step: left shows more of the left
  await wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Zoom in").trigger("click");
  const zoomed = { ...view() };
  expect(zoomed.scaleX).toBeGreaterThan(fitted.scaleX);
  expect(key(host, "ArrowLeft")).toBe(false);
  await flushPromises();
  expect(view().x).toBe(zoomed.x + 80);
  key(host, "ArrowUp");
  await flushPromises();
  expect(view().y).toBe(zoomed.y + 80);
  key(host, "ArrowRight");
  key(host, "ArrowDown");
  await flushPromises();
  expect(view()).toMatchObject({ x: zoomed.x, y: zoomed.y });
  // an arrow on one of its buttons is the button's, not the photo's
  key(host.querySelector("button"), "ArrowLeft");
  await flushPromises();
  expect(view().x).toBe(zoomed.x);
});

test("every light mark has a dark edge under it: the brush's ring, the box and the split line", async () => {
  mountCanvas({ tool: "brush", split: 0.5 });
  // the split line: a wider black line, then the white one
  const [splitEdge, split] = configs("v-line");
  expect(split.stroke).toBe("#ffffff");
  expect(splitEdge).toMatchObject({ stroke: "#000000", points: split.points });
  expect(splitEdge.strokeWidth).toBeGreaterThan(split.strokeWidth);
  // the brush's ring: solid black under the white dashes (the two-tone "marching ants")
  fire("pointermove");
  await flushPromises();
  const [ringEdge, ring] = configs("v-circle");
  expect(ring).toMatchObject({ stroke: "#ffffff", dash: expect.any(Array) });
  expect(ringEdge).toMatchObject({ stroke: "#000000", radius: ring.radius, dash: undefined });
  expect(ringEdge.strokeWidth).toBeGreaterThan(ring.strokeWidth);
  // the box, while it is drawn
  await wrapper.setProps({ tool: "box" });
  fire("pointerdown");
  pointerAt = { x: 80, y: 60 };
  fire("pointermove");
  await flushPromises();
  const [boxEdge, box] = configs("v-rect");
  expect(box).toMatchObject({ stroke: "#ffffff", dash: expect.any(Array) });
  expect(boxEdge).toMatchObject({ stroke: "#000000", x: box.x, y: box.y, width: box.width, height: box.height, dash: undefined });
});

test("the brush's stroke has an edge that contrasts with its paint: black under a light one, white under a dark one", async () => {
  mountCanvas({ tool: "brush", strokeColor: "#f4f2ea" });
  fire("pointerdown");
  pointerAt = { x: 60, y: 50 };
  fire("pointermove");
  await flushPromises();
  let [edge, line] = configs("v-line");
  expect(line.stroke).toBe("#f4f2ea");
  expect(edge.stroke).toBe("#000000");
  expect(edge.strokeWidth).toBeGreaterThan(line.strokeWidth);
  fire("pointerup");
  // the eraser's preview is black: its edge is white
  await wrapper.setProps({ tool: "eraser" });
  fire("pointerdown");
  fire("pointermove");
  await flushPromises();
  [edge, line] = configs("v-line");
  expect(line.stroke).toBe("#000000");
  expect(edge.stroke).toBe("#ffffff");
});

const strokes = () => wrapper.emitted("stroke") || [];

test("one pointer draws at a time: a second finger never paints, and its lifting doesn't end the stroke", async () => {
  mountCanvas({ tool: "brush" });
  // the first finger down on the photo: its pointer is captured (its moves are heard off the canvas)
  fire("pointerdown", { pointerId: 7, pointerType: "touch" });
  expect(captured).toEqual([7]);
  // a second finger down, moving and lifted meanwhile: none of it is the stroke's
  pointerAt = { x: 90, y: 70 };
  fire("pointerdown", { pointerId: 8, pointerType: "touch" });
  fire("pointermove", { pointerId: 8, pointerType: "touch" });
  fire("pointerup", { pointerId: 8, pointerType: "touch" });
  expect(captured).toEqual([7]);
  expect(strokes()).toHaveLength(0);
  // the first finger moves and is lifted: one stroke, its points alone
  pointerAt = { x: 60, y: 40 };
  fire("pointermove", { pointerId: 7, pointerType: "touch" });
  fire("pointerup", { pointerId: 7, pointerType: "touch" });
  await flushPromises();
  expect(strokes()).toHaveLength(1);
  const [{ points }] = strokes()[0];
  expect(points.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual(
    [{ x: 50, y: 40 }, { x: 60, y: 40 }].map((s) => {
      const v = view();
      return [Math.round((s.x - v.x) / v.scaleX), Math.round((s.y - v.y) / v.scaleY)];
    }),
  );
  // the stroke over, the next finger draws
  fire("pointerdown", { pointerId: 8, pointerType: "touch" });
  expect(captured).toEqual([7, 8]);
});

test("a pointer the system takes back (pointercancel — a palm, an edge swipe) drops its stroke: nothing is painted", async () => {
  mountCanvas({ tool: "brush" });
  fire("pointerdown", { pointerId: 3, pointerType: "pen" });
  pointerAt = { x: 70, y: 50 };
  fire("pointermove", { pointerId: 3, pointerType: "pen" });
  await flushPromises();
  expect(configs("v-line").length).toBeGreaterThan(0); // the stroke's preview
  // another pointer's cancel isn't this one's
  fire("pointercancel", { pointerId: 4, pointerType: "touch" });
  await flushPromises();
  expect(configs("v-line").length).toBeGreaterThan(0);
  fire("pointercancel", { pointerId: 3, pointerType: "pen" });
  // Konva tells a cancel's listeners pointerup too: it paints nothing
  fire("pointerup", { pointerId: 3, pointerType: "pen" });
  await flushPromises();
  expect(configs("v-line")).toEqual([]);
  expect(strokes()).toHaveLength(0);
  // the brush is free again
  fire("pointerdown", { pointerId: 5 });
  fire("pointerup", { pointerId: 5 });
  expect(strokes()).toHaveLength(1);
});

test("the canvas follows the screen's pixel ratio: a window moved to a sharper screen draws sharp", async () => {
  const ratio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  try {
    mountCanvas();
    await flushPromises();
    // the query for the ratio now (MDN's pattern), listened to
    expect(queries.map((q) => q.media)).toEqual(["(resolution: 1dppx)"]);
    expect(queries[0].listeners.size).toBe(1);
    // moved to a 2× screen: the query changes, the layer's canvas takes the new ratio and draws again,
    // and the new ratio's query is listened to instead
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    for (const f of [...queries[0].listeners]) f();
    expect(layer.canvas.ratio).toBe(2);
    expect(layer.draws).toBe(1);
    expect(queries.map((q) => q.media)).toEqual(["(resolution: 1dppx)", "(resolution: 2dppx)"]);
    expect(queries[0].listeners.size).toBe(0);
    expect(queries[1].listeners.size).toBe(1);
    // the page left: nothing listens
    wrapper.unmount();
    wrapper = null;
    expect(queries[1].listeners.size).toBe(0);
  } finally {
    if (ratio) Object.defineProperty(window, "devicePixelRatio", ratio);
    else delete window.devicePixelRatio;
  }
});

test("only the primary button draws; a pen's eraser end erases; a capture lost mid-stroke ends it there", async () => {
  // the fourteenth review: a right click left a dot, a lost capture (a native menu, Alt+Tab) kept the stroke live;
  // the sixteenth: it was listened to on the stage's container at mount, before the stage existed (no photo yet) —
  // never heard. Mounted with no photo, then given one, as the page does
  mountCanvas({ tool: "brush", brushSize: 4, photo: null });
  await wrapper.setProps({ photo: { width: 100, height: 80 } });
  fire("pointerdown", { button: 2 }); // right
  fire("pointerup", { button: 2 });
  fire("pointerdown", { button: 1 }); // middle
  fire("pointerup", { button: 1 });
  expect(wrapper.emitted("stroke")).toBeUndefined();
  // the pen's eraser end, the brush chosen: it erases
  fire("pointerdown", { pointerId: 4, pointerType: "pen", button: 5 });
  fire("pointerup", { pointerId: 4, pointerType: "pen", button: 5 });
  expect(wrapper.emitted("stroke").at(-1)[0].mode).toBe("erase");
  // the tip paints; its capture lost before any lift: what it drew is the stroke, and no later move adds to it
  fire("pointerdown", { pointerId: 6, pointerType: "pen" });
  pointerAt = { x: 60, y: 45 };
  fire("pointermove", { pointerId: 6, pointerType: "pen" });
  // dispatched where the browser does — the stage's canvas, inside the photo's host — and bubbling up
  wrapper.find(".stage-stub").element.dispatchEvent(Object.assign(new Event("lostpointercapture", { bubbles: true }), { pointerId: 6 }));
  const strokes = wrapper.emitted("stroke").length;
  expect(wrapper.emitted("stroke").at(-1)[0].mode).toBe("paint");
  fire("pointermove", { pointerId: 6, pointerType: "pen" });
  fire("pointerup", { pointerId: 6, pointerType: "pen" });
  expect(wrapper.emitted("stroke").length).toBe(strokes);
});

const keyWith = (el, k, opts = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
// the stand-in stage is 300 × 200 and the photo 100 × 80: fitted (its Fit) at 2.5×, 25 px in from the left
const mountFitted = async (props) => {
  mountCanvas(props);
  wrapper.vm.fit();
  await flushPromises();
  return wrapper;
};
const toPhoto = ({ x, y }) => ({ x: (x - 25) / 2.5, y: y / 2.5 });

test("a box is drawn with two clicks as well as a drag — one corner, then the other (WCAG 2.5.7)", async () => {
  await mountFitted({ tool: "box" });
  // a drag: one box
  fire("pointerdown");
  pointerAt = { x: 80, y: 60 };
  fire("pointermove");
  fire("pointerup");
  expect(wrapper.emitted("box")).toHaveLength(1);
  // a click: its corner waits; the box follows the pointer to the next click, which makes it
  pointerAt = { x: 50, y: 40 };
  fire("pointerdown");
  fire("pointerup");
  expect(wrapper.emitted("box")).toHaveLength(1);
  pointerAt = { x: 100, y: 90 };
  fire("pointermove");
  await flushPromises();
  expect(configs("v-rect").at(-1)).toMatchObject({ width: 20, height: 20 }); // the preview, in photo pixels
  fire("pointerdown");
  fire("pointerup");
  const a = toPhoto({ x: 50, y: 40 });
  const b = toPhoto({ x: 100, y: 90 });
  expect(wrapper.emitted("box")[1][0]).toEqual({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  // Escape lets go of a first corner
  fire("pointerdown");
  fire("pointerup");
  keyWith(wrapper.find(".house-canvas").element, "Escape");
  await flushPromises();
  expect(configs("v-rect")).toEqual([]);
});

test("with the box chosen the keyboard draws one: a crosshair, Enter at each corner, Escape to let go (WCAG 2.1.1)", async () => {
  const host = (await mountFitted({ tool: "box" })).find(".house-canvas").element;
  expect(document.getElementById(host.getAttribute("aria-describedby")).textContent).toContain("Enter sets one corner");
  const fitted = { ...view() };
  // the first key shows the crosshair in the middle of the view; the arrows move it, never the photo
  expect(keyWith(host, "ArrowRight")).toBe(false);
  await flushPromises();
  expect(configs("v-line")).toHaveLength(4); // the plus: two edges under two strokes
  keyWith(host, "Enter");
  keyWith(host, "ArrowRight", { shiftKey: true });
  keyWith(host, "ArrowDown", { shiftKey: true });
  await flushPromises();
  expect(view()).toEqual(fitted);
  expect(configs("v-rect").at(-1)).toMatchObject({ x: 50, y: 40, width: 32, height: 32 });
  keyWith(host, "Enter");
  expect(wrapper.emitted("box")).toEqual([[{ x0: 50, y0: 40, x1: 82, y1: 72 }]]);
  // a second box let go of with Escape; Escape again hides the crosshair
  keyWith(host, "Enter");
  keyWith(host, "ArrowLeft");
  keyWith(host, "Escape");
  await flushPromises();
  expect(configs("v-rect")).toEqual([]);
  expect(configs("v-line")).toHaveLength(4);
  keyWith(host, "Escape");
  await flushPromises();
  expect(configs("v-line")).toEqual([]);
  expect(wrapper.emitted("box")).toHaveLength(1);
});

test("with Pick a color chosen, Enter reads the color under the crosshair", async () => {
  const host = (await mountFitted({ tool: "pick" })).find(".house-canvas").element;
  keyWith(host, "ArrowUp");
  keyWith(host, "ArrowUp");
  keyWith(host, "Enter");
  expect(wrapper.emitted("pick")).toEqual([[{ x: 50, y: Math.floor(40 - 8 / 2.5) }]]);
  // another tool: the crosshair goes
  await wrapper.setProps({ tool: "look" });
  expect(configs("v-line")).toEqual([]);
});

test("a zoomed photo has pan buttons beside the zoom: a drag's single-pointer way (WCAG 2.5.7)", async () => {
  mountCanvas();
  const named = (name) => wrapper.findAll("button").find((b) => b.attributes("aria-label") === name);
  expect(named("Move left")).toBeUndefined();
  await named("Zoom in").trigger("click");
  const zoomed = { ...view() };
  await named("Move left").trigger("click");
  expect(view().x).toBe(zoomed.x + 80);
  await named("Move up").trigger("click");
  expect(view().y).toBe(zoomed.y + 80);
  // fitted again: they go
  await wrapper.findAll("button").find((b) => b.text() === "Fit").trigger("click");
  expect(named("Move left")).toBeUndefined();
});

test("keys take over a box a click began: its corner is the crosshair's, never where the pointer last was", async () => {
  const host = (await mountFitted({ tool: "box" })).find(".house-canvas").element;
  pointerAt = { x: 50, y: 40 };
  fire("pointerdown");
  fire("pointerup"); // a click: the first corner
  pointerAt = { x: 200, y: 150 };
  fire("pointermove"); // the pointer wanders off
  keyWith(host, "ArrowRight"); // the crosshair shows where the box had got to
  keyWith(host, "ArrowLeft", { shiftKey: true });
  keyWith(host, "ArrowUp", { shiftKey: true });
  keyWith(host, "Enter");
  const first = toPhoto({ x: 50, y: 40 });
  const hover = toPhoto({ x: 200, y: 150 });
  expect(wrapper.emitted("box")).toEqual([[{ x0: first.x, y0: first.y, x1: hover.x - 32, y1: hover.y - 32 }]]);
});

test("Enter held down sets one corner, not one per repeat; a handled Escape goes no further", async () => {
  const host = (await mountFitted({ tool: "pick" })).find(".house-canvas").element;
  keyWith(host, "ArrowDown");
  keyWith(host, "Enter");
  keyWith(host, "Enter", { repeat: true });
  keyWith(host, "Enter", { repeat: true });
  expect(wrapper.emitted("pick")).toHaveLength(1);
  const outside = vi.fn();
  document.body.addEventListener("keydown", outside);
  keyWith(host, "Escape"); // hides the crosshair: handled
  keyWith(host, "Escape"); // nothing left to let go of: the page's
  document.body.removeEventListener("keydown", outside);
  expect(outside).toHaveBeenCalledTimes(1);
});

test("another photo drops a box half drawn and the crosshair", async () => {
  const host = (await mountFitted({ tool: "box" })).find(".house-canvas").element;
  keyWith(host, "ArrowRight");
  keyWith(host, "Enter");
  keyWith(host, "ArrowRight", { shiftKey: true });
  await flushPromises();
  expect(configs("v-rect").length).toBeGreaterThan(0);
  await wrapper.setProps({ photo: { width: 120, height: 90 } });
  expect(configs("v-rect")).toEqual([]);
  expect(configs("v-line")).toEqual([]);
});

test("a finger's tap is a click for a box: within 10 px, where a mouse's is 4", async () => {
  await mountFitted({ tool: "box" });
  pointerAt = { x: 50, y: 40 };
  fire("pointerdown", { pointerType: "touch" });
  pointerAt = { x: 57, y: 46 }; // a finger moves a little as it lifts
  fire("pointermove", { pointerType: "touch" });
  fire("pointerup", { pointerType: "touch" });
  expect(wrapper.emitted("box")).toBeUndefined(); // armed, not a tiny box
  pointerAt = { x: 120, y: 100 };
  fire("pointerdown", { pointerType: "touch" });
  fire("pointerup", { pointerType: "touch" });
  expect(wrapper.emitted("box")).toHaveLength(1);
});
