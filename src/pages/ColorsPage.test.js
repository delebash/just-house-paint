// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// Paint colors mounted for real (app-structure §18) — the real stores, the kit, Quasar as the app
// installs it — against a stand-in server answering /v1/brands, /v1/settings and /v1/jobs in the
// real one's shapes (server/src/api/paints_api.js, settings_api.js, jobs.js). It proves: the seven
// brands with their color counts and where the colors came from; "Load automatically" per brand
// (on unless the setting turns it off, saved on a change, and a brand turned on with no colors
// loads them); a brand's load showing its progress above the table, not again in the global stack,
// with its row's buttons waiting; and a brand's last failed load (the server's lastError) on its row.
import { installLlmUi, LlmUiHosts } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { i18n } from "../i18n/index.js";
import ColorsPage from "./ColorsPage.vue";

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

// ── a stand-in server, in the real one's shapes ─────────────────────────────
let server;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });
const LOADED_AT = "2026-10-17T10:00:00.000Z";
// GET /v1/brands: every launch brand (server/src/paints/normalize.js BRANDS, in its order); all
// seven are fetchable (a public list, or the palette files its page links)
const brandRow = (key, label, fields = {}) => ({ key, label, feed: true, enabled: false, paintCount: 0, source: null, loadedAt: null, lastError: null, ...fields });
const loaded = (paintCount, source = "feed") => ({ enabled: true, paintCount, source, loadedAt: LOADED_AT });
const brands = () => [
  brandRow("sherwin-williams", "Sherwin-Williams", loaded(1948)),
  brandRow("behr", "Behr"),
  brandRow("benjamin-moore", "Benjamin Moore", loaded(4056, "file")),
  brandRow("valspar", "Valspar", loaded(1596)),
  brandRow("ppg-glidden", "PPG / Glidden", loaded(2108)),
  brandRow("hgtv-home", "HGTV Home by Sherwin-Williams", loaded(900)),
  brandRow("dutch-boy", "Dutch Boy", loaded(1340)),
];
// the job's snapshot (server/src/jobs.js snapshot())
const job = (key, fields = {}) => ({
  id: `j-${key}`,
  kind: "load-brand",
  key,
  label: server.brands.find((b) => b.key === key).label,
  state: "running",
  progress: 0,
  message: "",
  result: null,
  error: null,
  startedAt: LOADED_AT,
  finishedAt: null,
  ...fields,
});

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  const p = url.pathname;
  server.calls.push(`${method} ${p}`);
  if (p === "/v1/brands") return Promise.resolve(json(server.brands));
  if (p === "/v1/settings" && method === "GET") return Promise.resolve(json(server.settings));
  if (p === "/v1/settings" && method === "PATCH") {
    const body = JSON.parse(init.body);
    server.patches.push(body);
    Object.assign(server.settings, body);
    return Promise.resolve(json(server.settings));
  }
  const load = p.match(/^\/v1\/brands\/([^/]+)\/load$/);
  if (load && method === "POST") return Promise.resolve(json(job(decodeURIComponent(load[1])), 202));
  const poll = p.match(/^\/v1\/jobs\/j-([^/]+)$/);
  if (poll) {
    const key = decodeURIComponent(poll[1]);
    const row = server.brands.find((b) => b.key === key);
    if (server.hold) return Promise.resolve(json(job(key, { progress: 0.4, message: "downloading" })));
    if (server.fail) {
      // the server records why on the brand's row (recordBrandError), and the job ends in an error
      row.lastError = server.fail;
      return Promise.resolve(json(job(key, { state: "error", error: { message: server.fail, status: null }, finishedAt: LOADED_AT })));
    }
    // replaceBrandPaints: the colors in, the error cleared
    Object.assign(row, loaded(1212), { lastError: null });
    return Promise.resolve(json(job(key, { state: "done", progress: 1, result: { brand: key, paintCount: 1212 }, finishedAt: LOADED_AT })));
  }
  return Promise.resolve(json({}));
}

let wrapper;
async function mountPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/colors", component: ColorsPage }] });
  router.push("/colors");
  await router.isReady();
  const Host = { render: () => [h(quasar.QLayout, { view: "hhh lpr fff" }, () => h(quasar.QPageContainer, () => h(ColorsPage))), h(LlmUiHosts)] };
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
const click = async (el) => {
  el.click();
  await flushPromises();
};
/** A brand's row: the one whose name (its bold label) is exactly `label`. */
const rowOf = (label) => [...document.querySelectorAll("tr.ui-table-row")].find((tr) => tr.querySelector("strong")?.textContent.trim() === label);
const cells = (label) => [...rowOf(label).querySelectorAll("td")].map((td) => td.textContent.replace(/\s+/g, " ").trim());
const buttonIn = (label, words) => [...rowOf(label).querySelectorAll("button")].find((b) => b.textContent.includes(words));
const autoSwitch = (label) => document.querySelector(`[role="switch"][aria-label="Load the ${label} colors automatically"]`);
/** A server job polls every 400 ms (services/jobs.js): let the clock run. */
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 450));
    await flushPromises();
  }
};

beforeEach(() => {
  server = { calls: [], patches: [], brands: brands(), settings: { "paints.autoLoad": {} }, hold: false };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("the seven brands, each with its color count and where its colors came from", async () => {
  await mountPage();
  const names = [...document.querySelectorAll("tr.ui-table-row strong")].map((el) => el.textContent.trim());
  expect(names).toEqual(["Sherwin-Williams", "Behr", "Benjamin Moore", "Valspar", "PPG / Glidden", "HGTV Home by Sherwin-Williams", "Dutch Boy"]);
  // the count in the app's language (vue-i18n's n()), the source as a tag
  expect(cells("Sherwin-Williams")[1]).toBe("1,948");
  expect(cells("Sherwin-Williams")[2]).toContain("public list");
  expect(cells("Benjamin Moore")[1]).toBe("4,056");
  expect(cells("Benjamin Moore")[2]).toContain("palette file");
  // no colors yet: "None yet", no source, and the button that loads them
  expect(cells("Behr")[1]).toBe("None yet");
  expect(cells("Behr")[2]).toBe("");
  expect(buttonIn("Behr", "Load the colors")).toBeTruthy();
  expect(buttonIn("Behr", "Remove")).toBeUndefined();
  expect(buttonIn("Valspar", "Load again")).toBeTruthy();
  expect(buttonIn("Valspar", "Remove")).toBeTruthy();
});

test("Load automatically is on for every brand the setting doesn't turn off; turning one off saves it and loads nothing", async () => {
  server.settings = { "paints.autoLoad": { "dutch-boy": false } };
  await mountPage();
  expect(autoSwitch("Dutch Boy").getAttribute("aria-checked")).toBe("false");
  for (const label of ["Sherwin-Williams", "Behr", "Benjamin Moore", "Valspar", "PPG / Glidden", "HGTV Home by Sherwin-Williams"]) {
    expect(autoSwitch(label).getAttribute("aria-checked")).toBe("true");
  }
  await click(autoSwitch("Sherwin-Williams"));
  expect(server.calls).toContain("PATCH /v1/settings");
  expect(server.patches).toEqual([{ "paints.autoLoad": { "dutch-boy": false, "sherwin-williams": false } }]);
  expect(autoSwitch("Sherwin-Williams").getAttribute("aria-checked")).toBe("false");
  expect(server.calls.some((c) => c.startsWith("POST /v1/brands/"))).toBe(false);
});

test("turning Load automatically on for a brand with no colors loads them", async () => {
  server.settings = { "paints.autoLoad": { behr: false } };
  await mountPage();
  expect(autoSwitch("Behr").getAttribute("aria-checked")).toBe("false");
  await click(autoSwitch("Behr"));
  expect(server.patches).toEqual([{ "paints.autoLoad": { behr: true } }]);
  expect(server.calls).toContain("POST /v1/brands/behr/load");
  await settle();
  expect(autoSwitch("Behr").getAttribute("aria-checked")).toBe("true");
  expect(cells("Behr")[1]).toBe("1,212");
  expect(cells("Behr")[2]).toContain("public list");
}, 20000);

test("a brand's load shows its progress above the table — not again in the global stack — and its row's buttons wait", async () => {
  server.hold = true;
  await mountPage();
  await click(buttonIn("Behr", "Load the colors"));
  expect(server.calls).toContain("POST /v1/brands/behr/load");
  await new Promise((r) => setTimeout(r, 450));
  await flushPromises();
  const strip = document.querySelector(".q-page .paint-colors .sts");
  expect(strip?.textContent).toContain("Loading the Behr colors");
  expect(strip?.textContent).toContain("40%");
  expect(strip.querySelector(".sts-fill").style.width).toBe("40%");
  // above the table
  expect(strip.compareDocumentPosition(document.querySelector(".paint-colors table")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(document.querySelector(".ai-task-stack")).toBeNull();
  // the brand's own buttons wait; another brand's don't
  expect(buttonIn("Behr", "Load the colors").disabled).toBe(true);
  expect(buttonIn("Behr", "Import a file").disabled).toBe(true);
  expect(buttonIn("Valspar", "Load again").disabled).toBe(false);
  server.hold = false;
  await settle();
  // nothing of it runs now; its strip may linger a moment as done (the kit's dwell)
  expect(document.querySelector('.q-page .sts:not([data-status="done"])')).toBeNull();
  expect(document.querySelector(".ai-task-stack")).toBeNull();
  expect(buttonIn("Behr", "Load again").disabled).toBe(false);
  expect(buttonIn("Behr", "Import a file").disabled).toBe(false);
  expect(cells("Behr")[1]).toBe("1,212");
}, 20000);

test("a brand whose last load failed shows the server's error on its row", async () => {
  Object.assign(server.brands[3], { lastError: "the list's site answered 503" });
  await mountPage();
  expect(rowOf("Valspar").textContent).toContain("The last try failed: the list's site answered 503");
  expect(rowOf("Behr").textContent).not.toContain("The last try failed");
});

test("a load that fails here shows the server's reason on its row at once", async () => {
  server.fail = "the brand's site answered 503";
  await mountPage();
  await click(buttonIn("Behr", "Load the colors"));
  await settle();
  expect(rowOf("Behr").textContent).toContain("The last try failed: the brand's site answered 503");
  expect(buttonIn("Behr", "Load the colors").disabled).toBe(false);
}, 20000);
