// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The house page's canvas mounted for real, with Konva's shapes stood in for (jsdom has no canvas:
// each vue-konva component renders nothing and keeps its `config`). It proves the keyboard way to
// the photo — a Tab stop with a name and a hint, whose arrow keys move it once zoomed and never
// when it is fitted — and that every light mark (the brush's ring, its stroke, the box, the split
// line) has a contrasting edge drawn under it, so it shows on a white house.
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
const shape = (name) => ({ name, props: ["config"], render() { return h("i", { "data-shape": name }, this.$slots.default?.()); } });
const KONVA = {
  "v-stage": {
    name: "v-stage",
    props: ["config"],
    methods: { getNode: () => ({ getPointerPosition: () => pointerAt, batchDraw() {} }) },
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

beforeEach(() => {
  pointerAt = { x: 50, y: 40 };
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

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
  stage().vm.$emit("mousemove", { evt: {} });
  await flushPromises();
  const [ringEdge, ring] = configs("v-circle");
  expect(ring).toMatchObject({ stroke: "#ffffff", dash: expect.any(Array) });
  expect(ringEdge).toMatchObject({ stroke: "#000000", radius: ring.radius, dash: undefined });
  expect(ringEdge.strokeWidth).toBeGreaterThan(ring.strokeWidth);
  // the box, while it is drawn
  await wrapper.setProps({ tool: "box" });
  stage().vm.$emit("mousedown", { evt: {} });
  pointerAt = { x: 80, y: 60 };
  stage().vm.$emit("mousemove", { evt: {} });
  await flushPromises();
  const [boxEdge, box] = configs("v-rect");
  expect(box).toMatchObject({ stroke: "#ffffff", dash: expect.any(Array) });
  expect(boxEdge).toMatchObject({ stroke: "#000000", x: box.x, y: box.y, width: box.width, height: box.height, dash: undefined });
});

test("the brush's stroke has an edge that contrasts with its paint: black under a light one, white under a dark one", async () => {
  mountCanvas({ tool: "brush", strokeColor: "#f4f2ea" });
  stage().vm.$emit("mousedown", { evt: {} });
  pointerAt = { x: 60, y: 50 };
  stage().vm.$emit("mousemove", { evt: {} });
  await flushPromises();
  let [edge, line] = configs("v-line");
  expect(line.stroke).toBe("#f4f2ea");
  expect(edge.stroke).toBe("#000000");
  expect(edge.strokeWidth).toBeGreaterThan(line.strokeWidth);
  stage().vm.$emit("mouseup", { evt: {} });
  // the eraser's preview is black: its edge is white
  await wrapper.setProps({ tool: "eraser" });
  stage().vm.$emit("mousedown", { evt: {} });
  stage().vm.$emit("mousemove", { evt: {} });
  await flushPromises();
  [edge, line] = configs("v-line");
  expect(line.stroke).toBe("#000000");
  expect(edge.stroke).toBe("#ffffff");
});
