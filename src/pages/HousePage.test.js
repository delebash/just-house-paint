// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The house page mounted for real (app-structure §18) against a stand-in server in the real one's
// shapes. jsdom has no canvas, so two things are stood in for: the image service (services/
// maskImage.js — the photo's pixels and the masks as plain arrays) and the Konva canvas (its
// events are what the page reacts to; the painter, the stores, the tabs and the kit are real). It
// proves: the part finder's install offer and its job; the parts list; a color from the Colors tab
// painting the selected part, with its ΔE; finding the parts again asks first; a design saved under
// the route's own rules; the AI photo offering its install first; Undo / Redo and Reset; the
// eyedropper and a part's color as photographed; Compare; the outlines' choice; an old design's
// trim-group parts offered the trim's color (painted only on the click); the Designs tab's empty
// states; the paint a part has now, picked with "On it now", setting the light new paints show in.
import { _resolveDialog, dialogState, installLlmUi, LlmUiHosts, readPref, UiSelect } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
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
vi.mock("../components/HouseCanvas.vue", () => ({
  default: { name: "HouseCanvas", props: ["photo", "painted", "overlay", "before", "split", "tool", "sideBySide"], render: () => h("div", { class: "house-canvas-stub" }) },
}));

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
const WHITE = { id: "behr:W1", brand: "behr", code: "W1", name: "Chalk White", displayName: "Behr Chalk White W1", hex: "#f4f2ea", exterior: true };

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const p = url.pathname;
  server.calls.push(`${method} ${p}`);
  if (p === "/v1/houses/h1") return Promise.resolve(json({ ...HOUSE, currentPaints: server.currentPaints }));
  if (p === "/v1/houses/h1/current-paints" && method === "PUT") {
    server.currentPaints = JSON.parse(init.body);
    return Promise.resolve(json({ ...HOUSE, currentPaints: server.currentPaints }));
  }
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
  if (mask && method === "PUT") return Promise.resolve(json(server.parts.find((x) => x.key === mask[1])));
  if (mask) return Promise.resolve(new Response(new Blob([mask[1]])));
  if (p === "/v1/brands") return Promise.resolve(json([{ key: "behr", label: "Behr", feed: true, enabled: true, paintCount: 1, source: "feed", loadedAt: null, lastError: null }]));
  if (p === "/v1/settings") {
    return Promise.resolve(
      json({
        "finder.parts": [],
        "schemes.roleParts": { body: ["body"], trim: ["trim", "soffit", "windowTrim"], accent: [] },
        "paints.colorOrder": { grayChroma: 8, bandDegrees: 30, families: [{ key: "reds", from: 333 }, { key: "blues", from: 181 }] },
      }),
    );
  }
  if (p === "/v1/segment/status")
    return Promise.resolve(json({ installed: server.finderInstalled, downloadBytes: 3_364_167_120, ...(server.finderInstalled ? {} : { runtime: server.runtime || { ok: true } }) }));
  if (p === "/v1/aiphoto/status") return Promise.resolve(json({ engineInstalled: false, modelsInstalled: false, backend: "cuda12", slow: false, downloadBytes: 9e9 }));
  if (p === "/v1/segment/install") return Promise.resolve(json({ id: "j-install", state: "running", progress: 0 }, 202));
  if (p === "/v1/houses/h1/find-parts") {
    server.findBody = init.body ? JSON.parse(init.body) : null;
    return Promise.resolve(json({ id: "j-find", state: "running", progress: 0 }, 202));
  }
  if (p === "/v1/jobs/j-install") {
    server.finderInstalled = true;
    return Promise.resolve(json({ id: "j-install", state: "done", progress: 1, result: { installed: true } }));
  }
  if (p === "/v1/jobs/j-find" && server.holdFind) return Promise.resolve(json({ id: "j-find", state: "running", progress: 0.4, message: "trim" }));
  if (p === "/v1/jobs/j-find") {
    server.parts = PARTS;
    return Promise.resolve(json({ id: "j-find", state: "done", progress: 1, result: { parts: 2 } }));
  }
  if (decodeURIComponent(p) === `/v1/paints/${PAINT.id}`) return Promise.resolve(json(PAINT));
  // a color its brand's new list dropped: the server has no paint for the id
  if (decodeURIComponent(p) === "/v1/paints/behr:GONE-1") {
    return Promise.resolve(new Response(JSON.stringify({ title: "Not Found", status: 404, detail: "no paint behr:GONE-1" }), { status: 404, headers: { "content-type": "application/problem+json" } }));
  }
  if (decodeURIComponent(p) === `/v1/paints/${WHITE.id}`) return Promise.resolve(json(WHITE));
  if (p === "/v1/paints/nearest") return Promise.resolve(json([{ paint: PAINT, deltaE: 3.2 }]));
  if (p === "/v1/paints") {
    server.searches.push(Object.fromEntries(url.searchParams));
    return Promise.resolve(json({ total: 2, rows: [PAINT, WHITE] }));
  }
  return Promise.resolve(json({}));
}

let wrapper;
async function mountPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/house/:id", component: HousePage }, { path: "/", component: { render: () => null } }] });
  router.push("/house/h1");
  await router.isReady();
  // the page under the router's view, as in the app (its route guards need the matched record)
  const Host = { render: () => [h(quasar.QLayout, { view: "hhh lpr fff" }, () => h(quasar.QPageContainer, () => h(RouterView))), h(LlmUiHosts)] };
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
  server = { calls: [], parts: [], designs: [], finderInstalled: true, currentPaints: {}, searches: [] };
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

test("when the part finder's engine can't load here, the card says so and downloads nothing", async () => {
  server.finderInstalled = false;
  server.runtime = { ok: false, error: "libonnxruntime.so.1: cannot open shared object file" };
  await mountPage();
  expect(text()).toContain("The part finder can't run on this computer: its engine didn't load (libonnxruntime.so.1");
  expect(byText("button", "Install (").disabled || byText("button", "Install (").classList.contains("disabled")).toBe(true);
  await click(byText("button", "Install ("));
  expect(server.calls).not.toContain("POST /v1/segment/install");
});

test("a color from the Colors tab paints the selected part, and the Parts tab shows it with its ΔE", async () => {
  server.parts = PARTS;
  await mountPage();
  // the first paintable part is selected when the house opens
  await click(byText(".q-tab", "Colors"));
  expect(text()).toContain("Colors for the Body");
  await click(byText(".chip", "Sea Blue"));
  // the paint as it shows on this wall: in shade, on most of it, in light — the light one is the chip
  const tones = document.body.querySelector(".colors__tones");
  expect(tones?.textContent).toContain("On this wall:");
  expect([...tones.querySelectorAll(".swatch")].map((s) => s.title)).toContain("#3366aa");
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

test("finding the parts again offers to keep the parts changed by hand — on, unless unticked", async () => {
  server.parts = PARTS.map((p) => (p.key === "trim" ? { ...p, source: "edited" } : p));
  await mountPage();
  await click(byText("button", "Find the parts again"));
  expect(dialogState.options.fields).toEqual([{ key: "keep", type: "checkbox", label: "Keep the parts you changed by hand: Trim", defaultValue: true }]);
  _resolveDialog({ keep: true });
  await settle();
  expect(server.findBody).toEqual({ keepEdited: true });
  await click(byText("button", "Find the parts again"));
  _resolveDialog({ keep: false });
  await settle();
  expect(server.findBody).toEqual({ keepEdited: false });
}, 20000);

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

const DESIGN = { id: "d1", houseId: "h1", name: "Blue body", colors: { body: "behr:S1" }, createdAt: HOUSE.createdAt, updatedAt: HOUSE.updatedAt };
const canvas = () => wrapper.findComponent({ name: "HouseCanvas" });
const paintBody = async () => {
  await click(byText(".q-tab", "Colors"));
  await click(byText(".chip", "Sea Blue"));
  await click(byText(".q-tab", "Parts"));
};
const menuItem = (words) => byText('[role="menuitem"]', words);

test("Undo and Redo take a color back and put it again — the buttons and Ctrl+Z", async () => {
  server.parts = PARTS;
  await mountPage();
  expect(byText("button", "Undo").disabled).toBe(true);
  await paintBody();
  expect(text()).toContain("Behr Sea Blue S1");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
  await flushPromises();
  expect(text()).not.toContain("Behr Sea Blue S1");
  await click(byText("button", "Redo"));
  expect(text()).toContain("Behr Sea Blue S1");
});

test("Reset takes every paint off, or goes back to the open design's colors", async () => {
  server.parts = PARTS;
  server.designs = [DESIGN];
  await mountPage();
  await click(byText(".q-tab", "Designs"));
  await click(byText(".designs__row", "Blue body"));
  await click(byText(".q-tab", "Parts"));
  expect(text()).toContain("Behr Sea Blue S1");
  // nothing changed yet: only "Remove all colors"
  await click(byText("button", "Reset"));
  expect(menuItem("Back to")).toBeUndefined();
  await click(menuItem("Remove all colors"));
  expect(text()).not.toContain("Behr Sea Blue S1");
  await click(byText("button", "Reset"));
  await click(menuItem("Back to “Blue body”"));
  expect(text()).toContain("Behr Sea Blue S1");
});

test("the eyedropper and a part's color as photographed find the nearest paints", async () => {
  server.parts = PARTS;
  await mountPage();
  // the light grey photo: every part is #c8c8c8 as photographed
  await click(document.body.querySelector(".parts__now"));
  expect(text()).toContain("From the photo");
  expect(document.body.querySelector("#exact-hex").value).toBe("#c8c8c8");
  expect(server.calls).toContain("GET /v1/paints/nearest");
  await click(byText(".q-tab", "Parts"));
  server.calls.length = 0;
  await click(byText(".ui-seg button", "Pick a color"));
  expect(canvas().props("tool")).toBe("pick");
  canvas().vm.$emit("pick", { x: 1, y: 1 });
  await flushPromises();
  expect(text()).toContain("From the photo");
  expect(server.calls).toContain("GET /v1/paints/nearest");
});

test("Compare shows the photo as taken or a saved design left of the split", async () => {
  server.parts = PARTS;
  server.designs = [DESIGN];
  await mountPage();
  expect(canvas().props("split")).toBeNull();
  const compare = wrapper.findAllComponents(UiSelect).find((c) => c.props("options").some((o) => o.value === "photo"));
  expect(compare.props("options").map((o) => o.label)).toEqual(["Nothing", "The photo as taken", "Blue body"]);
  compare.vm.$emit("update:modelValue", "d1");
  await flushPromises();
  expect(canvas().props("split")).toBe(0.5);
  expect(canvas().props("before")).toEqual({ width: W, height: H });
  // side by side: the two pictures next to each other
  expect(canvas().props("sideBySide")).toBe(false);
  const side = document.body.querySelector(".house__side .q-toggle");
  await click(side);
  expect(canvas().props("sideBySide")).toBe(true);
  compare.vm.$emit("update:modelValue", "photo");
  await flushPromises();
  expect(canvas().props("before")).toBeNull();
  compare.vm.$emit("update:modelValue", "off");
  await flushPromises();
  expect(canvas().props("split")).toBeNull();
  // nothing to compare: no side by side, and its switch is gone
  expect(canvas().props("sideBySide")).toBe(false);
  expect(document.body.querySelector(".house__side")).toBeNull();
});

test("the outlines: the selected part's by default, every part's, or none — and the choice is kept", async () => {
  server.parts = PARTS;
  await mountPage();
  expect(canvas().props("overlay")).not.toBeNull();
  await click(byText(".ui-seg button", "Off"));
  expect(canvas().props("overlay")).toBeNull();
  await click(byText(".ui-seg button", "All parts"));
  expect(canvas().props("overlay")).not.toBeNull();
  expect(readPref("outlines")).toBe("all");
  // back to the default, for the tests after this one (the kit's prefs are one document per app)
  await click(byText(".ui-seg button", "Selected part"));
});

test("the colors in color order by default, or by name — the choice kept; a Color family filters them", async () => {
  server.parts = PARTS;
  await mountPage();
  await click(byText(".q-tab", "Colors"));
  expect(server.searches.at(-1)).toMatchObject({ order: "color" });
  expect(server.searches.at(-1).colorFamily).toBeUndefined();
  await click(byText(".ui-seg button", "Name"));
  expect(server.searches.at(-1)).toMatchObject({ order: "name" });
  expect(readPref("paintOrder")).toBe("name");
  // the families: the near-grays, then the setting's, in its order
  const family = wrapper.findAllComponents(UiSelect).find((c) => c.props("options").some((o) => o.value === "neutrals"));
  expect(family.props("options").map((o) => o.label)).toEqual(["Neutrals", "Reds", "Blues"]);
  family.vm.$emit("update:modelValue", "blues");
  await flushPromises();
  expect(server.searches.at(-1)).toMatchObject({ order: "name", colorFamily: "blues" });
  family.vm.$emit("update:modelValue", null);
  await flushPromises();
  expect(server.searches.at(-1).colorFamily).toBeUndefined();
  // back to the default, for the tests after this one (the kit's prefs are one document per app)
  await click(byText(".ui-seg button", "Color"));
  expect(readPref("paintOrder")).toBe("color");
});

test("leaving the house with colors no design holds asks first; No stays, Yes leaves", async () => {
  server.parts = PARTS;
  await mountPage();
  const router = wrapper.vm.$router;
  await paintBody();
  router.push("/");
  await flushPromises();
  expect(text()).toContain("Leaving the house drops them");
  _resolveDialog(false);
  await flushPromises();
  expect(router.currentRoute.value.path).toBe("/house/h1");
  router.push("/");
  await flushPromises();
  _resolveDialog(true);
  await flushPromises();
  expect(router.currentRoute.value.path).toBe("/");
});

test("finding the parts shows its progress on the page — not twice in the global stack — and its button waits", async () => {
  server.parts = PARTS;
  server.holdFind = true;
  await mountPage();
  await click(byText("button", "Find the parts again"));
  _resolveDialog(true);
  await flushPromises();
  await new Promise((r) => setTimeout(r, 450));
  await flushPromises();
  const strip = document.querySelector(".q-page .sts");
  expect(strip?.textContent).toContain("Finding the parts of Main street");
  // which part it is looking for now, as the percent goes up
  expect(strip?.textContent).toContain("Trim · 40%");
  expect(strip.querySelector(".sts-fill").style.width).toBe("40%");
  expect(document.querySelector(".ai-task-stack")).toBeNull();
  expect(byText("button", "Find the parts again").disabled).toBe(true);
  server.holdFind = false;
  await settle();
  expect(document.querySelector(".q-page .sts")).toBeNull();
  expect(byText("button", "Find the parts again").disabled).toBe(false);
}, 20000);

// ── a design saved before the house had some trim-group parts ───────────────
// "AI scheme 1" colors the body and the trim; the house has since gained soffits and window trim
const TRIM_PARTS = [
  ...PARTS,
  { key: "soffit", paintable: true, area: 6, score: 0.7, source: "auto", position: 2 },
  { key: "windowTrim", paintable: true, area: 6, score: 0.7, source: "auto", position: 3 },
];
const OLD_DESIGN = { id: "d2", houseId: "h1", name: "AI scheme 1", colors: { body: PAINT.id, trim: WHITE.id }, createdAt: HOUSE.createdAt, updatedAt: HOUSE.updatedAt };
const openOld = async (design = OLD_DESIGN, others = []) => {
  server.parts = TRIM_PARTS;
  server.designs = [design, ...others];
  await mountPage();
  await click(byText(".q-tab", "Designs"));
  await click(byText(".designs__row", design.name));
};
const offer = () => document.body.querySelector(".designs__offer");
/** The Parts tab's parts painted the trim's white, by name. */
const whiteParts = async () => {
  await click(byText(".q-tab", "Parts"));
  const rows = [...document.body.querySelectorAll(".parts__row")].filter((r) => r.textContent.includes(WHITE.displayName));
  const names = rows.map((r) => r.querySelector(".parts__name").textContent.trim()).sort();
  await click(byText(".q-tab", "Designs"));
  return names;
};

test("a part whose color its brand no longer has says so, instead of looking unpainted", async () => {
  await openOld({ ...OLD_DESIGN, colors: { body: PAINT.id, trim: "behr:GONE-1" } });
  await click(byText(".q-tab", "Parts"));
  expect(byText(".parts__row", "Trim").querySelector(".parts__paint").textContent.trim()).toBe("Behr GONE-1 — not in the loaded colors");
  expect(byText(".parts__row", "Soffits").querySelector(".parts__paint").textContent.trim()).toBe("No color");
});

test("an old design's trim-group parts with no color are offered the trim's color, and painted only on the click", async () => {
  await openOld();
  expect(offer().textContent).toContain("Soffits and fascia and Window trim have no color in this design.");
  // the actions sit under the words (the side panel is too narrow for them inline)
  expect(offer().querySelector(".q-banner__actions").classList.contains("col-all")).toBe(true);
  // nothing painted unasked — and the offer outlasts a visit to another tab
  expect(await whiteParts()).toEqual(["Trim"]);
  await click(byText(".designs__offer button", "Paint them the trim's color"));
  expect(offer()).toBeNull();
  expect(await whiteParts()).toEqual(["Soffits and fascia", "Trim", "Window trim"]);
  expect(byText(".designs__row", "AI scheme 1").textContent).toContain("changed");
  // one step for Undo
  await click(byText("button", "Undo"));
  expect(await whiteParts()).toEqual(["Trim"]);
});

test("the offer goes when it would no longer be true: all colors removed, or the design deleted", async () => {
  await openOld();
  expect(offer()).not.toBeNull();
  // Reset → Remove all colors: the trim is no longer the color the offer would paint
  await click(byText("button", "Reset"));
  await click(byText('[role="menuitem"]', "Remove all colors"));
  expect(offer()).toBeNull();
  // Undo brings the design's colors back — and with them the offer
  await click(byText("button", "Undo"));
  expect(offer()).not.toBeNull();
});

test("dismissing the offer hides it and paints nothing; opening another design takes it away", async () => {
  await openOld(OLD_DESIGN, [DESIGN]);
  await click(byText(".designs__offer button", "Dismiss"));
  expect(offer()).toBeNull();
  expect(await whiteParts()).toEqual(["Trim"]);
  // opened again: offered again; another design opened: gone
  await click(byText(".designs__row", "AI scheme 1"));
  expect(offer()).not.toBeNull();
  await click(byText(".designs__row", "Blue body"));
  expect(offer()).toBeNull();
});

test("only the trim-group parts the design leaves without a color are offered — none when it colors them all", async () => {
  await openOld({ ...OLD_DESIGN, colors: { ...OLD_DESIGN.colors, soffit: PAINT.id } });
  expect(offer().textContent).toContain("Window trim has no color in this design.");
  await click(byText(".designs__offer button", "Paint it the trim's color"));
  // the soffits keep the design's own color
  expect(await whiteParts()).toEqual(["Trim", "Window trim"]);
  wrapper.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  await openOld({ ...OLD_DESIGN, colors: { ...OLD_DESIGN.colors, soffit: PAINT.id, windowTrim: WHITE.id } });
  expect(offer()).toBeNull();
});

test("the Designs tab without designs or AI photos shows the kit's empty states", async () => {
  server.parts = PARTS;
  await mountPage();
  await click(byText(".q-tab", "Designs"));
  const empties = [...document.body.querySelectorAll(".designs .ui-empty")].map((e) => e.textContent.trim());
  expect(empties).toEqual(["No designs saved yet.", "No AI photos yet — the AI photo button makes one from the colors on screen."]);
});

test("the paint on a part now: picked with On it now (not painted), kept on the house, and new paints show in its light", async () => {
  server.parts = PARTS;
  await mountPage();
  await click(byText(".q-tab", "Colors"));
  await click(byText(".ui-seg button", "On it now"));
  expect(text()).toContain("Pick the paint this part has today");
  await click(byText(".chip", "Chalk White"));
  expect(server.currentPaints).toEqual({ body: WHITE.id });
  expect(server.calls).toContain("PUT /v1/houses/h1/current-paints");
  const now = document.body.querySelector(".colors__now");
  expect(now?.textContent).toContain("On it now:");
  expect(now.textContent).toContain("Behr Chalk White W1");
  // not painted: the part has no color yet, and the next click is a new color again
  expect(document.body.querySelector(".colors__tones")).toBeNull();
  expect(text()).not.toContain("Pick the paint this part has today");
  await click(byText(".chip", "Sea Blue"));
  // the photo's grey wall IS that white in this light: Sea Blue shows darker than its chip there
  const light = () => [...document.body.querySelectorAll(".colors__tones .swatch")].at(-1).title;
  const value = (hex) => Number.parseInt(hex.slice(5, 7), 16);
  expect(light()).not.toBe("#3366aa");
  expect(value(light())).toBeLessThan(0xaa);
  // Clear: back to the chip in the photo's own light
  await click(byText(".colors__now .q-btn", "Clear"));
  expect(server.currentPaints).toEqual({});
  expect(document.body.querySelector(".colors__now")).toBeNull();
  expect(light()).toBe("#3366aa");
});
