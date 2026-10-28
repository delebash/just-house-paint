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
import { usePaintsStore } from "../stores/paints.js";

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
// Save image's painting runs in a Web Worker (jsdom has none): what the page hands it is recorded, and
// it answers when the test says (`saving.finish`)
const saving = vi.hoisted(() => ({ asked: [], finish: null }));
vi.mock("../services/fullSizeImage.js", async (importOriginal) => ({
  ...(await importOriginal()),
  paintFullSize: (params) => {
    saving.asked.push(params);
    return new Promise((resolve) => {
      saving.finish = () => resolve(new Blob(["jpeg"], { type: "image/jpeg" }));
    });
  },
}));
vi.mock("../components/HouseCanvas.vue", () => ({
  default: { name: "HouseCanvas", props: ["photo", "painted", "overlay", "before", "split", "tool", "sideBySide", "version"], render: () => h("div", { class: "house-canvas-stub" }) },
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
const RENDER = { id: "r9", houseId: "h1", designId: null, deltaE: 1.1, seconds: 42, createdAt: "2026-10-17T10:00:00.000Z" };
const WHITE = { id: "behr:W1", brand: "behr", code: "W1", name: "Chalk White", displayName: "Behr Chalk White W1", hex: "#f4f2ea", exterior: true };

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const p = url.pathname;
  server.calls.push(`${method} ${p}`);
  if (p === "/v1/houses/h1" && server.gone) return Promise.resolve(json({ type: "about:blank", title: "Not Found", status: 404, detail: "no house h1" }, 404));
  if (p === "/v1/houses/h1")
    return Promise.resolve(json({ ...HOUSE, ...server.house, partsFoundAt: server.partsFoundAt ?? null, currentPaints: server.currentPaints, outlines: server.version }));
  // only the parts named (JSON Merge Patch): null takes one off
  if (p === "/v1/houses/h1/current-paints" && method === "PATCH") {
    const merged = { ...(server.currentPaints || {}), ...JSON.parse(init.body) };
    server.currentPaints = Object.fromEntries(Object.entries(merged).filter(([, v]) => v));
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
  if (p === "/v1/houses/h1/renders") return Promise.resolve(json(server.renders || []));
  // the house's jobs running now (started before the window reloaded, or in another window)
  if (p === "/v1/houses/h1/jobs") return Promise.resolve(json(server.jobs || []));
  if (p === "/v1/jobs/j-ai" && server.holdAi) return Promise.resolve(json({ id: "j-ai", kind: "aiphoto", key: "h1", state: "running", progress: 0.5, message: "" }));
  if (p === "/v1/jobs/j-ai") return Promise.resolve(json({ id: "j-ai", kind: "aiphoto", key: "h1", state: "done", progress: 1, result: RENDER }));
  if (p === "/v1/houses/h1/image" && server.photoMissing)
    return Promise.resolve(json({ type: "about:blank", title: "Not Found", status: 404, detail: "the display copy of house h1 is missing" }, 404));
  if (p === "/v1/houses/h1/image") return Promise.resolve(new Response(new Blob(["jpeg"])));
  const mask = p.match(/^\/v1\/houses\/h1\/parts\/(\w+)\/mask$/);
  // the house deleted meanwhile (the server's houseNotFound, naming the house it means)
  if (mask && method === "PUT" && server.goneNow) {
    const problem = { type: "https://just-house-paint.local/errors/house-not-found", title: "This house isn't here any more", status: 404, detail: "it was deleted — in another window, or by a reset" };
    return Promise.resolve(json({ ...problem, houseId: server.goneNow }, 404));
  }
  // the outlines' version (the server's outlines.js): a write on another version is refused (412), one on this one
  // answers the next
  if (mask && method === "PUT" && server.version) {
    const sent = new Headers(init.headers).get("if-match");
    server.ifMatch.push(sent);
    if (sent !== server.version) {
      const problem = { type: "https://just-house-paint.local/errors/outlines-changed", title: "This house was changed in another window", status: 412, detail: "your last change wasn't saved — the house is shown as it is now" };
      return Promise.resolve(json({ ...problem, houseId: "h1" }, 412));
    }
    server.version = `"v${Number(server.version.slice(2, -1)) + 1}"`;
    return Promise.resolve(json({ ...server.parts.find((x) => x.key === mask[1]), outlines: server.version }));
  }
  if (mask && method === "PUT") return Promise.resolve(json(server.parts.find((x) => x.key === mask[1])));
  if (mask) return Promise.resolve(new Response(new Blob([mask[1]])));
  if (p === "/v1/brands")
    return Promise.resolve(json([{ key: "behr", label: "Behr", feed: true, enabled: true, paintCount: server.noBrandYet ? 0 : 1, source: "feed", loadedAt: null, lastError: null }]));
  if (p === "/v1/settings") {
    return Promise.resolve(
      json({
        "finder.parts": [],
        "photos.fullSizeMaxMegapixels": 16,
        "schemes.roleParts": { body: ["body"], trim: ["trim", "soffit", "windowTrim"], accent: [] },
        "paints.colorOrder": { grayChroma: 8, bandDegrees: 30, families: [{ key: "reds", from: 333 }, { key: "blues", from: 181 }] },
      }),
    );
  }
  if (p === "/v1/segment/status")
    return Promise.resolve(json({ installed: server.finderInstalled, downloadBytes: 3_364_167_120, ...(server.finderInstalled ? {} : { runtime: server.runtime || { ok: true } }) }));
  // the kit's readiness for the AI photo's feature (its engine and model are the kit's sd.cpp runtime's)
  if (p === "/v1/ai/features/aiphoto.render/readiness") return Promise.resolve(json(server.aiphotoReadiness || AIPHOTO_NOT_INSTALLED));
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
  // its brand removed (or its new list dropped it): the server has no paint for the id any more
  if (decodeURIComponent(p) === `/v1/paints/${PAINT.id}` && server.paintGone)
    return Promise.resolve(json({ type: "about:blank", title: "Not Found", status: 404, detail: `no paint ${PAINT.id}` }, 404));
  if (decodeURIComponent(p) === `/v1/paints/${PAINT.id}`) return Promise.resolve(json(PAINT));
  // a color its brand's new list dropped: the server has no paint for the id
  if (decodeURIComponent(p) === "/v1/paints/behr:GONE-1") {
    return Promise.resolve(new Response(JSON.stringify({ title: "Not Found", status: 404, detail: "no paint behr:GONE-1" }), { status: 404, headers: { "content-type": "application/problem+json" } }));
  }
  if (decodeURIComponent(p) === `/v1/paints/${WHITE.id}`) return Promise.resolve(json(WHITE));
  if (p === "/v1/paints/nearest") return Promise.resolve(json([{ paint: PAINT, deltaE: 3.2 }]));
  // the Schemes tab: harmony schemes around a paint, and the brand's own pairings (none here)
  if (p === "/v1/schemes/harmony") return Promise.resolve(json(server.harmony || []));
  if (/^\/v1\/paints\/[^/]+\/schemes$/.test(p)) return Promise.resolve(json([]));
  if (p === "/v1/paints") {
    server.searches.push(Object.fromEntries(url.searchParams));
    // `paintTotal`: the brand has more than the two shown (Show more)
    return Promise.resolve(json({ total: server.paintTotal || 2, rows: [PAINT, WHITE] }));
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
/** In the side panel's rows (parts, designs, AI photos): any control inside another control (a button
 *  in a button, a button in a role=button row) — none is allowed. */
const CONTROL = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
const nestedControls = () =>
  [...document.querySelectorAll(".parts__row, .designs__row, .designs__render")].flatMap((row) =>
    [...row.querySelectorAll(CONTROL)]
      .filter((el) => el.parentElement.closest(CONTROL) && row.contains(el.parentElement.closest(CONTROL)))
      .map((el) => `${el.className} in ${el.parentElement.closest(CONTROL).className}`),
  );
/** A server job polls every 400 ms (services/jobs.js): let the clock run. */
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 450));
    await flushPromises();
  }
};

beforeEach(() => {
  server = { calls: [], parts: [], designs: [], finderInstalled: true, currentPaints: {}, searches: [], ifMatch: [] };
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
  // Box asks the finder: off, saying why, until it is installed (the sixteenth review)
  const box = () => byText(".ui-seg button", "Box");
  expect(box().getAttribute("aria-disabled")).toBe("true");
  // its reason is its description (the kit's tooltip shows it on hover and focus — no native title any more)
  const reason = (el) => document.getElementById(el.getAttribute("aria-describedby"))?.textContent || "";
  expect(reason(box())).toContain("Off until the part finder is installed");
  await click(byText("button", "Install ("));
  await settle();
  expect(server.calls).toContain("POST /v1/segment/install");
  expect(box().getAttribute("aria-disabled")).not.toBe("true");
  expect(text()).toContain("Find the parts first");
  await click(byText(".ui-empty button, .ui-empty .q-btn", "Find the parts"));
  await settle();
  expect(server.calls).toContain("POST /v1/houses/h1/find-parts");
  expect(text()).toContain("To paint");
  expect(text()).toContain("Body");
  expect(text()).toContain("Trim");
}, 20000);

test("with the part finder removed, the house's parts stay listed and paintable, the install beside them", async () => {
  server.finderInstalled = false;
  server.parts = PARTS;
  await mountPage();
  expect(text()).toContain("To paint");
  expect(text()).toContain("Body");
  expect(text()).toContain("Install the part finder");
});

test("a search that found nothing says so; a deleted house says it's gone, with the way back", async () => {
  server.partsFoundAt = "2026-10-19T10:00:00.000Z";
  await mountPage();
  expect(text()).toContain("No parts found on this photo");
  wrapper.unmount();
  document.body.innerHTML = "";
  server.gone = true;
  await mountPage();
  expect(text()).toContain("This house isn't here any more");
  expect(text()).not.toContain("no house h1");
});

test("a change to a house deleted meanwhile (another window, a reset) shows it's gone — no toast for it", async () => {
  server.parts = PARTS;
  await mountPage();
  expect(text()).toContain("To paint");
  const { useHouseStore } = await import("../stores/house.js");
  // another house's answer (a save that ran after the page left it) isn't this one's
  server.goneNow = "h2";
  await expect(useHouseStore().saveMask("body", new Blob(["png"]), "h1")).rejects.toMatchObject({ status: 404 });
  await flushPromises();
  expect(text()).toContain("To paint");
  // this house's: the page says it's gone, and the error is a cancel to reportError (no toast)
  server.goneNow = "h1";
  await expect(useHouseStore().saveMask("body", new Blob(["png"]))).rejects.toMatchObject({ status: 404, cancelled: true });
  await flushPromises();
  expect(text()).toContain("This house isn't here any more");
});

test("when the part finder's engine can't load here, the card says so and downloads nothing", async () => {
  server.finderInstalled = false;
  server.runtime = { ok: false, error: "libonnxruntime.so.1: cannot open shared object file" };
  await mountPage();
  expect(text()).toContain("The part finder can't run on this computer: its engine didn't load (libonnxruntime.so.1");
  // off, but focusable (aria-disabled): Find the parts again brings the keyboard to it
  expect(byText("button", "Install (").getAttribute("aria-disabled")).toBe("true");
  await click(byText("button", "Install ("));
  expect(server.calls).not.toContain("POST /v1/segment/install");
});

test("Find the parts again without the part finder: its card, its Install focused even while off, and why — by state", async () => {
  server.finderInstalled = false;
  server.parts = PARTS;
  server.runtime = { ok: false, error: "libonnxruntime.so.1: cannot open shared object file" };
  await mountPage();
  // it can't run here: said so, not "install it" (the twentieth review)
  await click(byText("button", "Find the parts again"));
  await flushPromises();
  expect(document.activeElement).toBe(byText("button", "Install ("));
  await vi.waitFor(() => expect(document.querySelector("[data-live-announcer]").textContent).toMatch(/can't run on this computer yet/));
  // still installing: said so
  const { useEnginesStore } = await import("../stores/engines.js");
  const engines = useEnginesStore();
  engines.finder = { ...engines.finder, runtime: { ok: true } };
  engines.installing = { ...engines.installing, finder: true };
  await click(byText(".q-tab", "Colors"));
  await click(byText("button", "Find the parts again"));
  await flushPromises();
  expect(document.activeElement?.textContent).toContain("Installing");
  await vi.waitFor(() => expect(document.querySelector("[data-live-announcer]").textContent).toMatch(/still installing/));
  expect(server.calls).not.toContain("POST /v1/houses/h1/find-parts");
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
  expect([...tones.querySelectorAll(".swatch")].map((s) => s.getAttribute("aria-label"))).toContain("#3366aa");
  // a group named by its words; each swatch a picture named by its color, for a screen reader too — no title
  // beside the name (read twice)
  expect(tones.getAttribute("role")).toBe("group");
  expect(document.getElementById(tones.getAttribute("aria-labelledby")).textContent).toBe("On this wall:");
  for (const s of tones.querySelectorAll(".swatch")) {
    expect(s.getAttribute("role")).toBe("img");
    expect(s.getAttribute("aria-label")).toMatch(/^#[0-9a-f]{6}$/);
    expect(s.hasAttribute("title")).toBe(false);
  }
  await click(byText(".q-tab", "Parts"));
  expect(text()).toContain("Behr Sea Blue S1");
  expect(text()).toMatch(/ΔE \d+\.\d/);
  // the ΔE tag's green says "close" in words as well (screen-reader text), and the grey "not close"
  const tag = byText(".parts__row", "Body").querySelector(".ui-tag");
  const words = tag.querySelector(".visually-hidden").textContent;
  expect(words).toContain(tag.classList.contains("ui-tag--success") ? "— a close match to the paint chip" : "— not a close match to the paint chip");
  expect(tag.getAttribute("title")).toContain("ΔE2000");
});

test("the selection is announced: the selected part's row and the chosen paint's chip are pressed, the open design current", async () => {
  server.parts = PARTS;
  server.designs = [DESIGN];
  await mountPage();
  const pressed = (sel, words) => byText(sel, words).getAttribute("aria-pressed");
  expect(pressed(".parts__pick", "Body")).toBe("true");
  expect(pressed(".parts__pick", "Trim")).toBe("false");
  await click(byText(".parts__pick", "Trim"));
  expect(pressed(".parts__pick", "Trim")).toBe("true");
  expect(pressed(".parts__pick", "Body")).toBe("false");
  await click(byText(".parts__pick", "Body"));
  await click(byText(".q-tab", "Designs"));
  expect(byText(".designs__open", "Blue body").hasAttribute("aria-current")).toBe(false);
  await click(byText(".designs__open", "Blue body"));
  expect(byText(".designs__open", "Blue body").getAttribute("aria-current")).toBe("true");
  // the design paints the body Sea Blue: its chip is the pressed one
  await click(byText(".q-tab", "Colors"));
  expect(pressed(".chip", "Sea Blue")).toBe("true");
  expect(pressed(".chip", "Chalk White")).toBe("false");
});

test("the paints are one Tab stop: the arrows, Home and End move along them, Enter picks, Show more stays on Tab", async () => {
  server.parts = PARTS;
  server.paintTotal = 5;
  await mountPage();
  await click(byText(".q-tab", "Colors"));
  const chips = () => [...document.body.querySelectorAll(".colors__grid .chip")];
  const stops = () => chips().map((c) => c.getAttribute("tabindex"));
  const press = (el, key, keyCode) => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode, bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key, keyCode, bubbles: true, cancelable: true }));
  };
  expect(byText(".colors__grid", "Sea Blue").getAttribute("role")).toBe("group");
  // nothing chosen yet: the first chip is the stop
  expect(stops()).toEqual(["0", "-1"]);
  chips()[0].focus();
  press(chips()[0], "ArrowRight");
  await flushPromises();
  expect(document.activeElement).toBe(chips()[1]);
  expect(stops()).toEqual(["-1", "0"]);
  // past the end, focus stays
  press(chips()[1], "ArrowRight");
  expect(document.activeElement).toBe(chips()[1]);
  press(chips()[1], "Home");
  expect(document.activeElement).toBe(chips()[0]);
  press(chips()[0], "End");
  expect(document.activeElement).toBe(chips()[1]);
  // up and down go by the grid's rows as laid out: here one chip a row
  Object.defineProperty(chips()[1], "offsetTop", { configurable: true, value: 50 });
  press(chips()[1], "ArrowUp");
  expect(document.activeElement).toBe(chips()[0]);
  press(chips()[0], "ArrowDown");
  expect(document.activeElement).toBe(chips()[1]);
  // Enter picks the focused chip (Chalk White), which is then the stop and pressed
  press(chips()[1], "Enter", 13);
  await flushPromises();
  expect(text()).toContain("Behr Chalk White W1");
  expect(chips()[1].getAttribute("aria-pressed")).toBe("true");
  await flushPromises();
  expect(stops()).toEqual(["-1", "0"]);
  // what follows the chips is still on Tab
  expect(byText("button", "Show more").getAttribute("tabindex")).not.toBe("-1");
});

test("Ctrl+Z: never under a dialog, nor while typing in a field — but from a read-only input (a list's focus)", async () => {
  server.parts = PARTS;
  await mountPage();
  await paintBody();
  const ctrlZ = (el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
  // a dialog open (Find the parts again asks first): the house's Undo stays out of it
  await click(byText("button", "Find the parts again"));
  expect(document.querySelector(".q-dialog")).not.toBeNull();
  ctrlZ(document.activeElement || document.body);
  await flushPromises();
  expect(byText(".parts__row", "Body").textContent).toContain("Behr Sea Blue S1");
  await click(byText(".q-dialog button", "Cancel"));
  await vi.waitFor(() => expect(document.querySelector(".q-dialog")).toBeNull(), { timeout: 3000 });
  // typing in a field (the exact color's hex): the field's own undo, not the house's
  await click(byText(".q-tab", "Colors"));
  ctrlZ(document.body.querySelector("#exact-hex"));
  await flushPromises();
  expect(document.body.querySelector(".colors__current")?.textContent).toContain("Behr Sea Blue S1");
  // the Compare with list focused — QSelect's focus is a read-only input: Undo works there
  const listFocus = document.body.querySelector(".house__tools .q-select__focus-target");
  expect(listFocus.readOnly).toBe(true);
  ctrlZ(listFocus);
  await flushPromises();
  expect(document.body.querySelector(".colors__current")).toBeNull();
});

test("passing through a slider's number box by Tab leaves its value: Texture stays at 1 (an emptied box too)", async () => {
  server.parts = PARTS;
  await mountPage();
  const box = byText("label.house__tool", "Texture").querySelector("input");
  const type = async (words) => {
    box.value = words;
    box.dispatchEvent(new Event("input"));
    await flushPromises();
  };
  const leave = async () => {
    box.blur();
    await flushPromises();
  };
  expect(box.value).toBe("1");
  // Tab in, Tab out, nothing typed (it used to go to the minimum, 0)
  box.focus();
  await leave();
  expect(box.value).toBe("1");
  expect(readPref("texture", 1)).toBe(1);
  // emptied, then left: the value comes back
  box.focus();
  await type("");
  await leave();
  expect(box.value).toBe("1");
  // a number typed still sets it
  box.focus();
  await type("0.5");
  await leave();
  expect(readPref("texture")).toBe(0.5);
  // back to the default, for the tests after this one (the kit's prefs are one document per app)
  box.focus();
  await type("1");
  await leave();
  expect(readPref("texture")).toBe(1);
});

test("the Texture slider moves while it is dragged and applies the texture when it is let go — not at every step", async () => {
  server.parts = PARTS;
  await mountPage();
  const range = wrapper
    .findAllComponents({ name: "UiSlider" })
    .find((c) => c.props("ariaLabel") === "Texture")
    .findComponent(quasar.QSlider);
  const drawn = canvas().props("version");
  // a drag: each step moves the slider (QSlider's update:model-value), nothing is painted again
  range.vm.$emit("update:modelValue", 0.6);
  range.vm.$emit("update:modelValue", 0.5);
  await flushPromises();
  expect(range.props("modelValue")).toBe(0.5);
  expect(canvas().props("version")).toBe(drawn);
  expect(readPref("texture", 1)).toBe(1);
  // let go (QSlider's change): the texture is applied, once
  range.vm.$emit("change", 0.5);
  await flushPromises();
  expect(canvas().props("version")).toBe(drawn + 1);
  expect(readPref("texture")).toBe(0.5);
  // back to the default, for the tests after this one (the kit's prefs are one document per app)
  range.vm.$emit("change", 1);
  await flushPromises();
  expect(readPref("texture")).toBe(1);
  expect(range.props("modelValue")).toBe(1);
});

test("Save image paints at most the setting's megapixels, in a worker, the button waiting meanwhile", async () => {
  // a 48 MP original (its display copy is the 8 × 6 the canvas shows)
  server.house = { width: 8000, height: 6000 };
  server.parts = PARTS;
  saving.asked.length = 0;
  const saved = [];
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:saved", revokeObjectURL() {} }));
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    saved.push(this.download);
  });
  await mountPage();
  await paintBody();
  const save = byText("button", "Save image");
  await click(save);
  expect(saving.asked).toHaveLength(1);
  const [asked] = saving.asked;
  // 48 MP down to the setting's 16, the same shape
  expect(asked.width * asked.height).toBeLessThanOrEqual(16e6);
  expect(asked.width / asked.height).toBeCloseTo(8000 / 6000, 3);
  expect(server.calls).toContain("GET /v1/houses/h1/image");
  expect(asked.photo).toBeInstanceOf(Blob);
  // the outlines at the display size (scaled in the worker), the screen's paint, light and texture
  expect([asked.maskWidth, asked.maskHeight]).toEqual([W, H]);
  expect(asked.masks.map((m) => m.key)).toEqual(["body", "trim"]);
  expect(asked.masks[0].mask).toHaveLength(W * H);
  expect(asked).toMatchObject({ colors: { body: PAINT.hex }, order: ["body", "trim"], light: 1, texture: 1, quality: 0.92 });
  // while it paints: the button waits (keeps its focus), a second press starts nothing
  expect(save.getAttribute("aria-disabled")).toBe("true");
  await click(save);
  expect(saving.asked).toHaveLength(1);
  saving.finish();
  await flushPromises();
  expect(saved).toEqual(["Main street — painted.jpg"]);
  expect(save.hasAttribute("aria-disabled")).toBe(false);
  clickSpy.mockRestore();
});

test("a saved file's name is the house's without what Windows can't hold: Save image and the color card", async () => {
  // "10/20" made a folder of the name, ":" "?" "*" a name Windows refuses
  server.house = { name: "10/20: Oak St?*" };
  server.parts = PARTS;
  const saved = [];
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:saved", revokeObjectURL() {} }));
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    saved.push(this.download);
  });
  // the color card draws on a canvas (jsdom has none): a context that draws nothing, and its PNG
  const ctx = new Proxy({ measureText: () => ({ width: 1 }) }, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true });
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => done(new Blob(["png"], { type: "image/png" })));
  await mountPage();
  await paintBody();
  await click(byText("button", "Save image"));
  saving.finish();
  await flushPromises();
  await click(byText(".q-tab", "Designs"));
  await click(byText("button", "Save a color card"));
  expect(saved).toEqual(["1020 Oak St — painted.jpg", "1020 Oak St — color card.png"]);
  clickSpy.mockRestore();
  getContext.mockRestore();
  toBlob.mockRestore();
});

test("an AI photo's row is named by what tells it apart: its design, when, and its ΔE", async () => {
  server.parts = PARTS;
  server.designs = [DESIGN];
  server.renders = [
    { id: "r1", houseId: "h1", designId: "d1", deltaE: 1.42, createdAt: HOUSE.createdAt },
    { id: "r2", houseId: "h1", designId: null, deltaE: null, createdAt: HOUSE.createdAt },
  ];
  await mountPage();
  await click(byText(".q-tab", "Designs"));
  const names = [...document.body.querySelectorAll(".designs__view")].map((r) => r.getAttribute("aria-label"));
  expect(names[0]).toMatch(/^Open the AI photo: Blue body, .+, ΔE 1\.4$/);
  expect(names[1]).toMatch(/^Open the AI photo: Colors on screen, .+$/);
  expect(names[1]).not.toContain("ΔE");
  // no control inside another: a row's main action and its Delete are side by side
  expect(nestedControls()).toEqual([]);
  await click(byText(".designs__view", "Blue body"));
  expect(text()).toContain("ΔE"); // the AI photo's dialog
});

test("a row's buttons are never inside another button: the part's swatch, a design's rename and delete", async () => {
  server.parts = PARTS;
  server.designs = [DESIGN];
  await mountPage();
  expect(document.body.querySelector(".parts__now")).not.toBeNull();
  expect(nestedControls()).toEqual([]);
  // the row itself is a list item, not a button; its main action selects, the swatch finds the color
  const row = byText(".parts__row", "Trim");
  expect(row.getAttribute("role")).toBe("listitem");
  expect(row.hasAttribute("tabindex")).toBe(false);
  await click(row.querySelector(".parts__now"));
  expect(text()).toContain("From the photo");
  await click(byText(".q-tab", "Parts"));
  expect(byText(".parts__pick", "Body").getAttribute("aria-pressed")).toBe("true");
  await click(byText(".q-tab", "Designs"));
  expect(nestedControls()).toEqual([]);
  expect(byText(".designs__row", "Blue body").getAttribute("role")).toBe("listitem");
  // Rename opens its dialog and leaves the open design as it was
  await click(byText(".designs__row", "Blue body").querySelector('[aria-label="Rename “Blue body”"]'));
  expect(document.body.querySelector("#name-dialog-input")).not.toBeNull();
  expect(byText(".designs__open", "Blue body").hasAttribute("aria-current")).toBe(false);
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

const AIPHOTO_NOT_INSTALLED = {
  feature: "aiphoto.render",
  kind: "image",
  ready: false,
  need: "engine-not-installed",
  runtime: "sdcpp",
  model: "flux2-klein-4b",
  engine: { id: "sdcpp", label: "stable-diffusion.cpp", installed: false, downloadBytes: 906941374, need: null, status: "", downloaded: 0, total: 0 },
  modelState: { id: "flux2-klein-4b", name: "FLUX.2 [klein] 4B", bytes: 8749156110, onDisk: false, fit: "ok", speedBand: "fast", predSpeed: 20, measuredSpeed: null, speedUnit: "s/image", status: "" },
};

test("the AI photo says why it's off; where no engine exists, nothing is offered to install", async () => {
  server.parts = PARTS;
  await mountPage();
  // why, in words beside the buttons (a disabled button takes no focus: a tooltip never reaches the
  // keyboard) — and as the button's description
  const ai = byText("button", "AI photo");
  expect(ai.disabled).toBe(true);
  expect(ai.hasAttribute("title")).toBe(false);
  expect(document.getElementById(ai.getAttribute("aria-describedby")).textContent).toBe("AI photo: Give a part a color first");
  await paintBody();
  expect(document.getElementById("house-ai-why")).toBeNull();
  expect(byText("button", "AI photo").hasAttribute("aria-describedby")).toBe(false);
  wrapper.unmount();
  document.body.innerHTML = "";
  // the kit's engine has no build for this computer: said, and nothing offered to install
  server.aiphotoReadiness = { ...AIPHOTO_NOT_INSTALLED, need: "engine-cant-run-here", engine: { ...AIPHOTO_NOT_INSTALLED.engine, need: { reason: "no-build" } } };
  await mountPage();
  await click(byText(".q-tab", "Colors"));
  await click(byText(".chip", "Sea Blue"));
  await click(byText("button", "AI photo"));
  await flushPromises();
  expect(text()).toContain("This engine has no build for this computer.");
  expect([...document.querySelectorAll("button")].some((b) => b.textContent.includes("Install the engine"))).toBe(false);
});

test("on the first start the Colors tab says the brands are loading, and takes the first one as it lands", async () => {
  server.parts = PARTS;
  server.noBrandYet = true;
  await mountPage();
  const paints = usePaintsStore();
  paints.autoLoadingBrands = true; // the start-up loads running (App's autoLoadBrands)
  await click(byText(".q-tab", "Colors"));
  expect(text()).toContain("The brands' colors are loading");
  expect(text()).not.toContain("Add a brand's colors first");
  // Behr's colors land while the tab is open
  server.noBrandYet = false;
  await paints.loadBrands();
  paints.autoLoadingBrands = false;
  await flushPromises();
  await new Promise((r) => setTimeout(r, 400)); // the search's debounce
  await flushPromises();
  expect(byText(".chip", "Sea Blue")).toBeTruthy();
});

test("a missing photo file isn't a deleted house; a part added and not drawn says empty", async () => {
  server.parts = [...PARTS, { key: "shutters", paintable: true, area: 0, score: 0, source: "added", position: 2 }];
  await mountPage();
  expect(text()).toContain("Shutters");
  expect(text()).toContain("empty");
  wrapper.unmount();
  document.body.innerHTML = "";
  server.photoMissing = true;
  await mountPage();
  expect(text()).not.toContain("This house isn't here any more");
  expect(text()).toContain("Couldn't open this house");
  expect(text()).toContain("the display copy of house h1 is missing");
});

test("the AI photo offers what it needs first — the kit's banner: its engine, with the model's fit and speed", async () => {
  server.parts = PARTS;
  await mountPage();
  await click(byText(".q-tab", "Colors"));
  await click(byText(".chip", "Sea Blue"));
  await click(byText("button", "AI photo"));
  await flushPromises();
  expect(text()).toContain("The AI photo runs on stable-diffusion.cpp, which isn't installed on this computer yet.");
  expect(byText("button", "Install the engine")).toBeTruthy();
  expect(text()).toContain("FLUX.2 [klein] 4B on this computer:");
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
  await click(byText(".designs__open", "Blue body"));
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

test("another tab opens the side panel at its top, not where the last one was scrolled to", async () => {
  server.parts = PARTS;
  await mountPage();
  await click(byText(".q-tab", "Colors"));
  const scroller = document.body.querySelector(".house__tab");
  scroller.scrollTop = 400;
  expect(scroller.scrollTop).toBe(400);
  await click(byText(".q-tab", "Parts"));
  expect(scroller.scrollTop).toBe(0);
});

test("a design's name inside the words is isolated: a right-to-left one leaves the quotes in place", async () => {
  server.parts = PARTS;
  server.designs = [{ ...DESIGN, name: "כחול" }];
  await mountPage();
  await click(byText(".q-tab", "Designs"));
  // its buttons' names (not HTML): between FIRST STRONG ISOLATE and POP DIRECTIONAL ISOLATE
  const labels = [...document.body.querySelectorAll(".designs [aria-label]")].map((el) => el.getAttribute("aria-label"));
  expect(labels).toEqual(expect.arrayContaining(["Rename “\u2068כחול\u2069”", "Delete “\u2068כחול\u2069”"]));
  await click(byText(".designs__open", "כחול"));
  await click(byText(".q-tab", "Colors"));
  await click(byText(".chip", "Chalk White"));
  await click(byText(".q-tab", "Designs"));
  expect(byText("button", "Save “").textContent).toContain("Save “\u2068כחול\u2069”");
  // the Reset menu's (the page's HTML): the name in a <bdi>
  await click(byText("button", "Reset"));
  const back = menuItem("Back to");
  expect(back.querySelector("bdi").textContent).toBe("כחול");
  expect(back.textContent.trim()).toBe("Back to “כחול”");
});

test("the eyedropper and a part's color as photographed find the nearest paints", async () => {
  server.parts = PARTS;
  await mountPage();
  // the light grey photo: every part is #c8c8c8 as photographed
  await click(document.body.querySelector(".parts__now"));
  expect(text()).toContain("From the photo");
  expect(document.body.querySelector("#exact-hex").value).toBe("#c8c8c8");
  expect(server.calls).toContain("GET /v1/paints/nearest");
  // the nearest paint's ΔE (3.2 here: grey, not green) says what its colour says, in words too
  const nearTag = document.body.querySelector(".colors__nearest .ui-tag");
  expect(nearTag.classList.contains("ui-tag--success")).toBe(false);
  expect(nearTag.querySelector(".visually-hidden").textContent).toContain("— not a close match to this color");
  expect(nearTag.getAttribute("title")).toContain("ΔE2000");
  await click(byText(".q-tab", "Parts"));
  server.calls.length = 0;
  await click(byText(".ui-seg button", "Pick a color"));
  expect(canvas().props("tool")).toBe("pick");
  // the matches are far below the panel's top: brought into view, and said (a keyboard pick showed nothing — the
  // sixteenth review)
  const scrolled = [];
  const scrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () {
    scrolled.push(this.classList.contains("colors__nearest") ? "the matches" : this.textContent);
  };
  try {
    canvas().vm.$emit("pick", { x: 1, y: 1 });
    await flushPromises();
  } finally {
    Element.prototype.scrollIntoView = scrollIntoView;
  }
  expect(text()).toContain("From the photo");
  expect(server.calls).toContain("GET /v1/paints/nearest");
  // the heading to the panel's top, then the matches themselves into view (below it in a short panel — 960 × 700)
  expect(scrolled).toEqual(["An exact color", "the matches"]);
  expect(document.querySelector("[data-live-announcer]").textContent).toMatch(/paints? nearest #c8c8c8, under An exact color/);
});

test("the hex box says what's wrong when Find is pressed, and stops saying it as it is put right", async () => {
  server.parts = PARTS;
  await mountPage();
  await click(byText(".q-tab", "Colors"));
  const box = document.body.querySelector("#exact-hex");
  box.value = "#12";
  box.dispatchEvent(new Event("input"));
  await flushPromises();
  expect(document.body.querySelector(".colors__exact .q-field--error")).toBeNull(); // nothing said while typing
  await click(byText("button", "Find the closest paints"));
  await flushPromises();
  expect(document.body.querySelector(".colors__exact .q-field--error")).not.toBeNull();
  box.value = "#1234";
  box.dispatchEvent(new Event("input"));
  await flushPromises();
  expect(document.body.querySelector(".colors__exact .q-field--error")).toBeNull();
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
  // answered with the dialog's own button, so it closes as it does in the app (its focus trap goes with it)
  await click(byText(".q-dialog button", "Find the parts again"));
  await vi.waitFor(() => expect(document.querySelector(".q-dialog")).toBeNull(), { timeout: 3000 });
  await new Promise((r) => setTimeout(r, 450));
  await flushPromises();
  const strip = document.querySelector(".q-page .sts");
  expect(strip?.textContent).toContain("Finding the parts of Main street");
  // which part it is looking for now, as the percent goes up
  expect(strip?.textContent).toContain("Trim · 40%");
  expect(strip.querySelector(".sts-fill").style.width).toBe("40%");
  expect(document.querySelector(".ai-task-stack .sts")).toBeNull();
  // the button waits — off (aria-disabled, the kit's off look) but not `disabled`, which would drop
  // keyboard focus to the page's body while the job runs; a press meanwhile starts nothing
  const find = byText("button", "Find the parts again");
  expect(find.getAttribute("aria-disabled")).toBe("true");
  expect(find.classList.contains("is-disabled")).toBe(true);
  expect(find.disabled).toBe(false);
  find.focus();
  await click(find);
  expect(dialogState.open).toBe(false);
  expect(server.calls.filter((c) => c === "POST /v1/houses/h1/find-parts")).toHaveLength(1);
  server.holdFind = false;
  await settle();
  expect(document.querySelector(".q-page .sts")).toBeNull();
  expect(find.hasAttribute("aria-disabled")).toBe(false);
  expect(find.disabled).toBe(false);
  expect(document.activeElement).toBe(find);
}, 20000);

test("a page opened while its parts are being found follows the run: its progress, the outline tools off, then the new outlines", async () => {
  // the outlines from before the run; the window reloaded while it runs
  server.parts = [PARTS[0]];
  server.holdFind = true;
  server.jobs = [{ id: "j-find", kind: "find-parts", key: "h1", state: "running", progress: 0.2, message: "" }];
  await mountPage();
  // asked before the house's parts are read: a run that ends in between is still followed
  expect(server.calls.indexOf("GET /v1/houses/h1/jobs")).toBeLessThan(server.calls.indexOf("GET /v1/houses/h1/parts"));
  await new Promise((r) => setTimeout(r, 450));
  await flushPromises();
  const strip = document.querySelector(".q-page .sts");
  expect(strip?.textContent).toContain("Finding the parts of Main street");
  expect(strip?.textContent).toContain("Trim · 40%");
  expect(server.calls).not.toContain("POST /v1/houses/h1/find-parts");
  expect(byText("button", "Find the parts again").getAttribute("aria-disabled")).toBe("true");
  // the brush, the eraser and the box are off, saying why; a stroke changes and saves nothing
  const brush = byText(".ui-seg button", "Brush");
  expect(brush.getAttribute("aria-disabled")).toBe("true");
  expect(document.getElementById(brush.getAttribute("aria-describedby"))?.textContent || "").toContain("Off while the parts are being found");
  await click(brush);
  expect(canvas().props("tool")).toBe("look");
  canvas().vm.$emit("stroke", { points: [1, 1, 3, 1], radius: 2, mode: "add" });
  canvas().vm.$emit("box", { x0: 0, y0: 0, x1: 4, y1: 4 });
  await new Promise((r) => setTimeout(r, 700));
  await flushPromises();
  expect(server.calls.filter((c) => c.startsWith("PUT ") || c.endsWith("/box"))).toEqual([]);
  // a color may still be picked, but Undo and Redo are off — the buttons and Ctrl+Z alike
  await paintBody();
  expect(text()).toContain("Behr Sea Blue S1");
  expect(byText("button", "Undo").disabled).toBe(true);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
  await flushPromises();
  expect(text()).toContain("Behr Sea Blue S1");
  // the run ends: the new parts and every outline read again, the tools back
  server.calls.length = 0;
  server.partsFoundAt = "2026-10-20T10:00:00.000Z";
  server.holdFind = false;
  await settle();
  expect(document.querySelector(".q-page .sts")).toBeNull();
  expect(server.calls).toContain("GET /v1/houses/h1/parts/body/mask");
  expect(server.calls).toContain("GET /v1/houses/h1/parts/trim/mask");
  expect([...document.body.querySelectorAll(".parts__row .parts__name")].map((n) => n.textContent.trim())).toHaveLength(2);
  expect(byText(".ui-seg button", "Brush").hasAttribute("aria-disabled")).toBe(false);
}, 20000);

test("while the parts are being found here, Undo can't put an outline back: Ctrl+Z and the button are off", async () => {
  server.parts = PARTS;
  await mountPage();
  // a stroke on the body, saved
  await click(byText(".ui-seg button", "Brush"));
  canvas().vm.$emit("stroke", { points: [1, 1, 3, 1], radius: 2, mode: "add" });
  await new Promise((r) => setTimeout(r, 700));
  await flushPromises();
  expect(server.calls.filter((c) => c === "PUT /v1/houses/h1/parts/body/mask")).toHaveLength(1);
  expect(byText("button", "Undo").disabled).toBe(false);
  // finding the parts again, held running
  server.holdFind = true;
  await click(byText("button", "Find the parts again"));
  await click(byText(".q-dialog button", "Find the parts again"));
  await vi.waitFor(() => expect(document.querySelector(".q-page .sts")).not.toBeNull(), { timeout: 3000 });
  const undo = byText("button", "Undo");
  expect(undo.disabled).toBe(true);
  expect(undo.getAttribute("title")).toContain("Off while the parts are being found");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true }));
  await new Promise((r) => setTimeout(r, 100));
  await flushPromises();
  expect(server.calls.filter((c) => c === "PUT /v1/houses/h1/parts/body/mask")).toHaveLength(1);
  server.holdFind = false;
  await settle();
}, 20000);

test("a page opened while its AI photo is being made follows it, and shows the photo when it's done", async () => {
  server.parts = PARTS;
  server.holdAi = true;
  server.jobs = [{ id: "j-ai", kind: "aiphoto", key: "h1", state: "running", progress: 0.3, message: "" }];
  await mountPage();
  await new Promise((r) => setTimeout(r, 450));
  await flushPromises();
  expect(document.querySelector(".q-page .sts")?.textContent).toContain("AI photo of Main street");
  expect(server.calls).not.toContain("POST /v1/houses/h1/aiphoto");
  server.holdAi = false;
  await settle();
  expect(document.querySelector(".q-page .sts")).toBeNull();
  expect(text()).toContain(i18n.global.t("aiPhoto.note"));
  await click(byText(".q-tab", "Designs"));
  expect(document.body.querySelectorAll(".designs__render")).toHaveLength(1);
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
  await click(byText(".designs__open", design.name));
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
  // the Designs tab counts what the house shows — the gone one apart, a part the house hasn't not at all — and
  // Compare says why that part shows as photographed (the twenty-first review)
  await click(byText(".q-tab", "Designs"));
  const caption = byText(".designs__row", "AI scheme 1").querySelector(".q-item__label--caption").textContent;
  expect(caption).toMatch(/1 color · 1 not in the loaded colors/);
  wrapper.findAllComponents(UiSelect).find((c) => c.props("options").some((o) => o.value === "photo")).vm.$emit("update:modelValue", OLD_DESIGN.id);
  await flushPromises();
  expect(text()).toContain("1 of its colors isn't in the loaded colors — that part shows as photographed");
});

test("the schemes say whose paint they're built around, and why not the body's (the twenty-first review)", async () => {
  await openOld({ ...OLD_DESIGN, colors: { body: "behr:GONE-1", trim: WHITE.id } });
  const { useHouseStore } = await import("../stores/house.js");
  useHouseStore().selectedPart = "trim";
  await click(byText(".q-tab", "Schemes"));
  await flushPromises();
  expect(text()).toContain("Around Behr Chalk White W1 — the Trim's paint (the body has no color of this brand)");
  expect(text()).toContain("The body's paint isn't in the loaded colors");
  expect(text()).not.toContain("Give the body a color first");
});

test("Copy the color list is off when no paint on screen can be copied", async () => {
  await openOld({ ...OLD_DESIGN, colors: { trim: "behr:GONE-1", chimneyCap: PAINT.id } });
  expect(byText("button", "Copy the color list").getAttribute("aria-disabled") === "true" || byText("button", "Copy the color list").disabled).toBe(true);
});

test("a brand's colors removed while a house shows one: its part says the color is gone and isn't painted with it", async () => {
  server.parts = PARTS;
  server.designs = [DESIGN];
  await mountPage();
  await click(byText(".q-tab", "Designs"));
  await click(byText(".designs__open", "Blue body"));
  await click(byText(".q-tab", "Parts"));
  const paintOf = () => document.body.querySelector(".parts__row .parts__paint").textContent.trim();
  expect(paintOf()).toBe("Behr Sea Blue S1");
  expect(document.body.querySelector(".parts__row").textContent).toContain("ΔE");
  const drawn = canvas().props("version");
  // removed on the Colors page (the paints store's clearBrand): the server has no paint for it now
  server.paintGone = true;
  await usePaintsStore().clearBrand("behr");
  await flushPromises();
  expect(server.calls.filter((c) => c === `GET /v1/paints/${encodeURIComponent(PAINT.id)}`)).toHaveLength(2);
  expect(paintOf()).toBe("Behr S1 — not in the loaded colors");
  // painted again without it: no ΔE for a paint that isn't there
  expect(canvas().props("version")).toBeGreaterThan(drawn);
  expect(document.body.querySelector(".parts__row").textContent).not.toContain("ΔE");
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
  await click(byText(".designs__open", "AI scheme 1"));
  expect(offer()).not.toBeNull();
  await click(byText(".designs__open", "Blue body"));
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
  expect(server.calls).toContain("PATCH /v1/houses/h1/current-paints");
  const now = document.body.querySelector(".colors__now");
  expect(now?.textContent).toContain("On it now:");
  expect(now.textContent).toContain("Behr Chalk White W1");
  // not painted: the part has no color yet, and the next click is a new color again
  expect(document.body.querySelector(".colors__tones")).toBeNull();
  expect(text()).not.toContain("Pick the paint this part has today");
  await click(byText(".chip", "Sea Blue"));
  // the photo's grey wall IS that white in this light: Sea Blue shows darker than its chip there
  const light = () => [...document.body.querySelectorAll(".colors__tones .swatch")].at(-1).getAttribute("aria-label");
  const value = (hex) => Number.parseInt(hex.slice(5, 7), 16);
  expect(light()).not.toBe("#3366aa");
  expect(value(light())).toBeLessThan(0xaa);
  // Clear: back to the chip in the photo's own light
  await click(byText(".colors__now .q-btn", "Clear"));
  expect(server.currentPaints).toEqual({});
  expect(document.body.querySelector(".colors__now")).toBeNull();
  expect(light()).toBe("#3366aa");
});

test("a part with no color shows the “none” swatch, its words in the row's caption; a painted part its paint", async () => {
  server.parts = PARTS;
  await mountPage();
  const swatchOf = (part) => byText(".parts__row", part).querySelector(".swatch");
  // an empty box read as an unticked checkbox (the visual review, 2026-10-20)
  expect(swatchOf("Body").classList.contains("swatch--none")).toBe(true);
  // hidden from a screen reader, which reads "No color" once, in the row's caption (named too, it was read twice)
  expect(swatchOf("Body").getAttribute("aria-hidden")).toBe("true");
  expect(byText(".parts__row", "Body").querySelector(".parts__paint").textContent).toBe("No color");
  await click(byText(".q-tab", "Colors"));
  await click(byText(".chip", "Sea Blue"));
  // the chosen paint's button takes it off — an action, named as one
  expect(byText(".colors__current .q-btn", "Remove the color")).toBeTruthy();
  await click(byText(".q-tab", "Parts"));
  expect(swatchOf("Body").classList.contains("swatch--none")).toBe(false);
  expect(swatchOf("Body").getAttribute("aria-hidden")).toBe("true");
  expect(swatchOf("Body").style.background).toBe("rgb(51, 102, 170)");
  // the part's facts (its share, its ΔE) on a line of their own under its paint's name
  const facts = byText(".parts__row", "Body").querySelector(".parts__facts");
  expect(facts.textContent).toMatch(/ΔE \d+\.\d/);
  expect(facts.compareDocumentPosition(byText(".parts__row", "Body").querySelector(".parts__paint")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  await click(byText(".q-tab", "Colors"));
  await click(byText(".colors__current .q-btn", "Remove the color"));
  await click(byText(".q-tab", "Parts"));
  expect(swatchOf("Body").classList.contains("swatch--none")).toBe(true);
});

test("a scheme that can't be applied says why on its row — never empty colors and a silent Apply", async () => {
  server.parts = PARTS;
  // a near-gray body: the server's note for each hue-based scheme (server/src/paints/harmony.js)
  server.harmony = [
    { kind: "complementary", complete: false, notes: ["the base color has no hue to build this scheme on"], roles: null },
    { kind: "classic", complete: true, notes: [], roles: { body: { paint: PAINT }, trim: { paint: WHITE }, accent: { paint: PAINT } } },
  ];
  await mountPage();
  await click(byText(".q-tab", "Colors"));
  await click(byText(".chip", "Sea Blue"));
  await click(byText(".q-tab", "Schemes"));
  await flushPromises();
  const schemeRow = (kind) => [...document.querySelectorAll(".scheme")].find((li) => li.querySelector("strong")?.textContent === kind);
  const row = schemeRow("Complementary");
  const why = row.querySelector(".scheme__why");
  expect(why.textContent).toBe("The paint is nearly gray: it has no hue to build this scheme on. Classic works with any color.");
  const apply = row.querySelector("button");
  expect(apply.disabled).toBe(true);
  expect(apply.getAttribute("aria-describedby")).toBe(why.id);
  // no paint for a role: the "none" swatch, not an empty box
  expect(row.querySelectorAll(".scheme__color.swatch--none")).toHaveLength(3);
  const classic = schemeRow("Classic");
  expect(classic.querySelector(".scheme__why")).toBeNull();
  expect(classic.querySelector("button").disabled).toBe(false);
  expect(classic.querySelector("button").hasAttribute("aria-describedby")).toBe(false);
});

// Several windows on one server (the eleventh review, 2026-10-20)
test("a stroke saved on outlines another window changed is refused: said so, read again, the next one lands", async () => {
  server.parts = PARTS;
  server.version = '"v1"';
  await mountPage();
  await click(byText(".ui-seg button", "Brush"));
  // a stroke on the outlines the page read: sent with their version, the next one taken from the answer
  canvas().vm.$emit("stroke", { points: [1, 1, 3, 1], radius: 2, mode: "add" });
  await new Promise((r) => setTimeout(r, 700));
  await flushPromises();
  expect(server.ifMatch).toEqual(['"v1"']);
  // another window changes them: this page's next stroke is refused, and the page reads the house again
  server.version = '"v7"';
  server.calls.length = 0;
  canvas().vm.$emit("stroke", { points: [5, 5, 6, 5], radius: 2, mode: "add" });
  await new Promise((r) => setTimeout(r, 700));
  await flushPromises();
  await flushPromises();
  // refused (the 412's words go to the toast, reportError): the house and its outlines read again
  expect(server.ifMatch).toEqual(['"v1"', '"v2"']);
  expect(server.calls).toContain("GET /v1/houses/h1");
  expect(server.calls).toContain("GET /v1/houses/h1/parts/body/mask");
  // read again: the next stroke carries the version that came with them
  canvas().vm.$emit("stroke", { points: [7, 7, 8, 7], radius: 2, mode: "add" });
  await new Promise((r) => setTimeout(r, 700));
  await flushPromises();
  expect(server.ifMatch.at(-1)).toBe('"v7"');
  expect(server.version).toBe('"v8"');
}, 20000);

test("another window's change: the page reads the house again in place, and follows the parts it is finding", async () => {
  server.parts = PARTS;
  await mountPage();
  await click(byText(".ui-seg button", "Brush"));
  const { otherWindows } = await import("@delebash/ui");
  // the other window started finding the parts and saved a design
  server.jobs = [{ id: "j-find", kind: "find-parts", key: "h1", state: "running", progress: 0.2, message: "" }];
  server.holdFind = true;
  server.designs = [{ id: "d9", houseId: "h1", name: "From the other window", colors: {}, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z" }];
  server.calls.length = 0;
  otherWindows.changes++;
  await vi.waitFor(() => expect(document.querySelector(".q-page .sts")).not.toBeNull(), { timeout: 3000 });
  expect(server.calls).toContain("GET /v1/houses/h1/jobs");
  expect(server.calls).toContain("GET /v1/houses/h1/designs");
  // the brush is off while the parts are found
  expect(byText(".ui-seg button", "Brush").getAttribute("aria-disabled")).toBe("true");
  await click(byText(".q-tab", "Designs"));
  expect(text()).toContain("From the other window");
  server.partsFoundAt = "2026-10-20T10:00:00.000Z";
  server.holdFind = false;
  server.jobs = [];
  await settle();
}, 20000);

test("a refused save drops the saves still waiting — they were made on the same old outlines", async () => {
  server.parts = PARTS;
  server.version = '"v1"';
  await mountPage();
  await click(byText(".ui-seg button", "Brush"));
  const { useHouseStore } = await import("../stores/house.js");
  // another window changed the outlines; this page strokes the body, then the trim, before either is saved
  server.version = '"v9"';
  canvas().vm.$emit("stroke", { points: [1, 1, 3, 1], radius: 2, mode: "add" });
  await flushPromises();
  useHouseStore().selectedPart = "trim";
  canvas().vm.$emit("stroke", { points: [5, 5, 6, 5], radius: 2, mode: "add" });
  await new Promise((r) => setTimeout(r, 900));
  await flushPromises();
  await flushPromises();
  // the first is refused; the second never goes with the version the re-read brings
  expect(server.calls.filter((c) => c === "PUT /v1/houses/h1/parts/body/mask")).toHaveLength(1);
  expect(server.calls.filter((c) => c === "PUT /v1/houses/h1/parts/trim/mask")).toHaveLength(0);
  expect(server.ifMatch).toEqual(['"v1"']);
}, 20000);
