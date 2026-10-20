// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The AI photo's dialog mounted for real: the render's ΔE and time, and — only when the server says
// other programs held the graphics card while it drew — which ones and how much (RESEARCH §12: an
// idle 6.9 GB model made it 8 s slower).
import { installLlmUi, LlmUiHosts } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h } from "vue";
import { i18n } from "../i18n/index.js";
import AiPhotoDialog from "./AiPhotoDialog.vue";

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));
const RENDER = { id: "r1", houseId: "h1", deltaE: 0.42, seconds: 28.3, sharedGpu: null };

let wrapper;
async function mountDialog(render, houseName = "My house") {
  const Host = { render: () => [h(AiPhotoDialog, { render, houseName }), h(LlmUiHosts)] };
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

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }))));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:render", revokeObjectURL() {} }));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("the AI photo names the other programs that held the graphics card, and only then", async () => {
  await mountDialog(RENDER);
  expect(text()).toContain("ΔE 0.4 from the chips");
  expect(text()).toContain("made in 28 s");
  expect(text()).not.toContain("graphics card");
  wrapper.unmount();
  document.body.innerHTML = "";

  await mountDialog({ ...RENDER, sharedGpu: { mb: 7066, programs: ["llama-server", "python · tts/serve.py"], more: 0 } });
  expect(text()).toContain("Other programs on the computer that draws it held 6.9 GB of its graphics card when it started (llama-server, python · tts/serve.py)");
  wrapper.unmount();
  document.body.innerHTML = "";

  await mountDialog({ ...RENDER, sharedGpu: { mb: 8000, programs: ["a", "b", "c"], more: 2 } });
  expect(text()).toContain("(a, b, c, 2 more)");
});

test("Save image names the file after the house, without what Windows can't hold", async () => {
  const saved = [];
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    saved.push(this.download);
  });
  // "10/20" made a folder of the name, ":" "?" "*" a name Windows refuses; nothing left, the fallback
  await mountDialog(RENDER, "10/20: Oak St?*");
  [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Save image")).click();
  await flushPromises();
  wrapper.unmount();
  document.body.innerHTML = "";
  await mountDialog(RENDER, "???");
  [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Save image")).click();
  await flushPromises();
  expect(saved).toEqual(["1020 Oak St — AI photo.png", "House — AI photo.png"]);
  clickSpy.mockRestore();
});
