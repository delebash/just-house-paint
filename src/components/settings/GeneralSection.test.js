// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// Settings → General and Advanced mounted for real (app-structure §18) against a stand-in
// /v1/settings: every label is a word from the catalog (a dotted setting key once showed as its raw
// i18n path), Save sends only what changed, a 422 lands under its field (§15), and Advanced refuses
// text that isn't JSON before sending it.
import { installLlmUi, LlmUiHosts } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h } from "vue";
import { i18n } from "../../i18n/index.js";
import AdvancedSection from "./AdvancedSection.vue";
import GeneralSection from "./GeneralSection.vue";

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

let server;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });
const VALUES = {
  "photos.displayMax": 2048,
  "photos.thumbMax": 480,
  "photos.jpegQuality": 88,
  "photos.maxMegabytes": 40,
  "designs.maxPerHouse": 30,
  "paints.maxImportMegabytes": 30,
  "finder.useGpu": true,
  "finder.idleMinutes": 10,
  "aiphoto.workingPixels": 786432,
  "finder.parts": [{ key: "body", labelKey: "parts.body", prompts: ["house"], paintable: true, group: "walls" }],
  "finder.priority": ["windows"],
  "schemes.roleParts": { body: ["body"], trim: [], accent: [] },
  "schemes.harmony": { exteriorOnly: true },
  "aiphoto.templates": { single: "Paint the {surface}" },
  "aiphoto.compose": { feather: 2 },
};

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  if (url.pathname !== "/v1/settings") return Promise.resolve(json({}));
  if (method === "GET") return Promise.resolve(json(server.values));
  const body = JSON.parse(init.body);
  server.patches.push(body);
  if (server.refuse) return Promise.resolve(server.refuse(body));
  Object.assign(server.values, body);
  return Promise.resolve(json(server.values));
}

let wrapper;
async function mountSection(Section) {
  const Host = { render: () => [h(quasar.QLayout, { view: "hhh lpr fff" }, () => h(quasar.QPageContainer, () => h(Section))), h(LlmUiHosts)] };
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [
        [quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }],
        i18n,
        createPinia(),
        { install: (app) => installLlmUi(app, { i18n, external: false }) },
      ],
      directives: { tooltip: {} },
    },
  });
  await flushPromises();
}
const text = () => document.body.textContent;
const byText = (selector, words) => [...document.body.querySelectorAll(selector)].find((el) => el.textContent.includes(words));
const type = async (found, value) => {
  // the id lands on the native input or on the control around it
  const el = found.matches("input, textarea") ? found : found.querySelector("input, textarea");
  el.value = value;
  el.dispatchEvent(new Event("input"));
  await flushPromises();
};
const submit = async (button) => {
  button.click();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
};

beforeEach(() => {
  server = { values: structuredClone(VALUES), patches: [] };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("General: every label is a word, Save sends only the change, a 422 lands under its field", async () => {
  await mountSection(GeneralSection);
  expect(text()).not.toMatch(/settings\.general/);
  expect(text()).toContain("Designs per house");
  expect(text()).toContain("Use the graphics card");

  await type(document.body.querySelector("#setting-designs-maxPerHouse"), "12");
  await submit(byText(".form__actions button", "Save"));
  expect(server.patches).toEqual([{ "designs.maxPerHouse": 12 }]);

  server.refuse = () =>
    json(
      {
        type: "https://just-house-paint.local/errors/validation-error",
        title: "Validation Error",
        status: 422,
        detail: "Request body failed validation.",
        errors: [{ loc: ["body", "photos.jpegQuality"], msg: "refused", type: "less_than_equal", ctx: { le: 100 } }],
        requestId: "rid-422",
      },
      422,
    );
  await type(document.body.querySelector("#setting-photos-jpegQuality"), "99");
  await submit(byText(".form__actions button", "Save"));
  expect(text()).toContain("100"); // the field's message, worded from the 422's ctx
});

test("Advanced: every label is a word, and text that isn't JSON is refused before it is sent", async () => {
  await mountSection(AdvancedSection);
  expect(text()).not.toMatch(/settings\.advanced/);
  expect(text()).toContain("Which parts each scheme color paints");

  const area = document.body.querySelector("#advanced-finder-priority");
  await type(area, "[not json");
  const button = area.closest(".ui-field").querySelector(".form__actions button");
  await submit(button);
  expect(text()).toContain("This isn't JSON");
  expect(server.patches).toEqual([]);

  await type(area, '["roof", "windows"]');
  await submit(button);
  expect(server.patches).toEqual([{ "finder.priority": ["roof", "windows"] }]);
});
