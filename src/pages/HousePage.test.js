// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The house page mounted for real (app-structure §18) against a stand-in server in the real one's
// shapes. jsdom has no canvas, so two things are stood in for: the image service (services/
// maskImage.js — the photo's pixels and the masks as plain arrays) and the Konva canvas (its
// events are what the page reacts to; the painter, the stores, the tabs and the kit are real). It
// proves: the part finder's install offer and its job; the parts list; a color from the Colors tab
// painting the selected part, with its ΔE; finding the parts again asks first; a design saved under
// the route's own rules; the AI photo offering its install first.
import { _resolveDialog, dialogState, installLlmUi, LlmUiHosts } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { i18n } from "../i18n/index.js";

const W = 8;
const H = 6;
vi.mock("../services/maskImage.js", () => ({
  // a light grey photo
  pixelsOf: async (_blob, w, h) => new Uint8ClampedArray(w * h * 4).fill(200),
  // the stand-in server's mask answers are the part's key: body is the top half, trim the bottom
  maskOf: async (blob, w, h) => {
    const key = await blob.text();
    const m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if ((i < (w * h) / 2) === (key === "body")) m[i] = 255;
    return m;
  },
  pngOf: async () => new Blob(["png"], { type: "image/png" }),
  drawPixels: (_rgba, width, height) => ({ width, height }),
}));
vi.mock("../components/HouseCanvas.vue", () => ({ default: { name: "HouseCanvas", props: ["photo", "painted"], render: () => h("div", { class: "house-canvas-stub" }) } }));

const { default: HousePage } = await import("./HousePage.vue");

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

// ── a stand-in server, in the real one's shapes ─────────────────────────────
let server;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });
const HOUSE = { id: "h1", name: "Main street", originalFile: "original.jpg", width: W, height: H, displayWidth: W, displayHeight: H, partsFoundAt: null, createdAt: "2026-10-17T10:00:00.000Z", updatedAt: "2026-10-17T10:00:00.000Z" };
const PARTS = [
  { key: "body", paintable: true, area: 24, score: 0.9, source: "auto", position: 0 },
  { key: "trim", paintable: true, area: 24, score: 0.8, source: "auto", position: 1 },
];
const PAINT = { id: "behr:S1", brand: "behr", code: "S1", name: "Sea Blue", displayName: "Behr Sea Blue S1", hex: "#3366aa", exterior: true };

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const p = url.pathname;
  server.calls.push(`${method} ${p}`);
  if (p === "/v1/houses/h1") return Promise.resolve(json(HOUSE));
  if (p === "/v1/houses/h1/parts") return Promise.resolve(json(server.parts));
  if (p === "/v1/houses/h1/designs" && method === "GET") return Promise.resolve(json(server.designs));
  if (p === "/v1/houses/h1/designs" && method === "POST") {
    const body = JSON.parse(init.body);
    const d = { id: "d1", houseId: "h1", ...body, createdAt: HOUSE.createdAt, updatedAt: HOUSE.updatedAt };
    server.designs.push(d);
    return Promise.resolve(json(d, 201));
  }
  if (p === "/v1/houses/h1/renders") return Promise.resolve(json([]));
  if (p === "/v1/houses/h1/image") return Promise.resolve(new Response(new Blob(["jpeg"])));
  const mask = p.match(/^\/v1\/houses\/h1\/parts\/(\w+)\/mask$/);
  if (mask) return Promise.resolve(new Response(new Blob([mask[1]])));
  if (p === "/v1/brands") return Promise.resolve(json([{ key: "behr", label: "Behr", feed: true, enabled: true, paintCount: 1, source: "feed", loadedAt: null, lastError: null }]));
  if (p === "/v1/settings") return Promise.resolve(json({ "finder.parts": [], "schemes.roleParts": { body: ["body"], trim: ["trim"], accent: [] } }));
  if (p === "/v1/segment/status") return Promise.resolve(json({ installed: server.finderInstalled, downloadBytes: 3_364_167_120 }));
  if (p === "/v1/aiphoto/status") return Promise.resolve(json({ engineInstalled: false, modelsInstalled: false, backend: "cuda12", slow: false, downloadBytes: 9e9 }));
  if (p === "/v1/segment/install") return Promise.resolve(json({ id: "j-install", state: "running", progress: 0 }, 202));
  if (p === "/v1/houses/h1/find-parts") return Promise.resolve(json({ id: "j-find", state: "running", progress: 0 }, 202));
  if (p === "/v1/jobs/j-install") {
    server.finderInstalled = true;
    return Promise.resolve(json({ id: "j-install", state: "done", progress: 1, result: { installed: true } }));
  }
  if (p === "/v1/jobs/j-find") {
    server.parts = PARTS;
    return Promise.resolve(json({ id: "j-find", state: "done", progress: 1, result: { parts: 2 } }));
  }
  if (p === "/v1/paints") return Promise.resolve(json({ total: 1, rows: [PAINT] }));
  return Promise.resolve(json({}));
}

let wrapper;
async function mountPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/house/:id", component: HousePage }, { path: "/", component: { render: () => null } }] });
  router.push("/house/h1");
  await router.isReady();
  const Host = { render: () => [h(quasar.QLayout, { view: "hhh lpr fff" }, () => h(quasar.QPageContainer, () => h(HousePage))), h(LlmUiHosts)] };
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [
        [quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }],
        i18n,
        createPinia(),
        router,
        { install: (app) => installLlmUi(app, { i18n, external: false }) },
      ],
      directives: { tooltip: {} },
    },
  });
  await flushPromises();
  return wrapper;
}
const text = () => document.body.textContent;
const byText = (selector, words) => [...document.body.querySelectorAll(selector)].find((el) => el.textContent.includes(words));
const click = async (el) => {
  el.click();
  await flushPromises();
};
/** A server job polls every 400 ms (services/jobs.js): let the clock run. */
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 450));
    await flushPromises();
  }
};

beforeEach(() => {
  server = { calls: [], parts: [], designs: [], finderInstalled: true };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("without the part finder: its install is offered, runs as a task, and then the parts can be found", async () => {
  server.finderInstalled = false;
  await mountPage();
  expect(text()).toContain("Main street");
  expect(text()).toContain("Install the part finder");
  await click(byText("button", "Install ("));
  await settle();
  expect(server.calls).toContain("POST /v1/segment/install");
  expect(text()).toContain("Find the parts first");
  await click(byText(".ui-empty button, .ui-empty .q-btn", "Find the parts"));
  await settle();
  expect(server.calls).toContain("POST /v1/houses/h1/find-parts");
  expect(text()).toContain("To paint");
  expect(text()).toContain("Body");
  expect(text()).toContain("Trim");
}, 20000);

test("a color from the Colors tab paints the selected part, and the Parts tab shows it with its ΔE", async () => {
  server.parts = PARTS;
  await mountPage();
  // the first paintable part is selected when the house opens
  await click(byText(".q-tab", "Colors"));
  expect(text()).toContain("Colors for the Body");
  await click(byText(".chip", "Sea Blue"));
  await click(byText(".q-tab", "Parts"));
  expect(text()).toContain("Behr Sea Blue S1");
  expect(text()).toMatch(/ΔE \d+\.\d/);
});

test("finding the parts again asks first", async () => {
  server.parts = PARTS;
  await mountPage();
  await click(byText("button", "Find the parts again"));
  expect(dialogState.open).toBe(true);
  _resolveDialog(false);
  await flushPromises();
  expect(server.calls).not.toContain("POST /v1/houses/h1/find-parts");
});

test("the colors on screen are saved as a named design", async () => {
  server.parts = PARTS;
  await mountPage();
  await click(byText(".q-tab", "Colors"));
  await click(byText(".chip", "Sea Blue"));
  await click(byText(".q-tab", "Designs"));
  await click(byText("button", "Save as a new design"));
  const input = document.body.querySelector("#name-dialog-input");
  input.value = "Blue body";
  input.dispatchEvent(new Event("input"));
  await flushPromises();
  await click(byText(".form__actions button", "Save"));
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
  expect(server.calls).toContain("POST /v1/houses/h1/designs");
  expect(server.designs[0]).toMatchObject({ name: "Blue body", colors: { body: "behr:S1" } });
  expect(text()).toContain("Blue body");
});

test("the AI photo offers its install first", async () => {
  server.parts = PARTS;
  await mountPage();
  await click(byText(".q-tab", "Colors"));
  await click(byText(".chip", "Sea Blue"));
  await click(byText("button", "AI photo"));
  expect(text()).toContain("Install the AI photo");
  expect(server.calls).not.toContain("POST /v1/houses/h1/aiphoto");
});
