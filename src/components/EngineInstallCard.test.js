// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The install card mounted for real, on the status the server sends: what this computer lacks is said
// before anything downloads — the Visual C++ runtime with Microsoft's own download linked, macOS 26,
// glibc 2.38, the app's own engine file quarantined — and Install is off; the AI photo's notes: slow on
// every build but CUDA, too little memory, its files gone (2026-10-20, the thirteenth review).
import { installLlmUi, LlmUiHosts } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { h } from "vue";
import { i18n } from "../i18n/index.js";
import { useEnginesStore } from "../stores/engines.js";
import EngineInstallCard from "./EngineInstallCard.vue";

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));
const AIPHOTO = { engineInstalled: false, engineMissing: [], modelsInstalled: false, backend: "cuda12", available: true, need: null, slow: false, lowMemory: null, downloadBytes: 9.6e9, diskBytes: 10.8e9 };
const FINDER = { installed: false, downloadBytes: 3.36e9, runtime: { ok: true } };

let wrapper;
async function mountCard(kind, status) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const engines = useEnginesStore();
  engines.finder = kind === "finder" ? status : FINDER;
  engines.aiphoto = kind === "aiphoto" ? status : AIPHOTO;
  const Host = { render: () => [h(EngineInstallCard, { kind }), h(LlmUiHosts)] };
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [[quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }], i18n, pinia, { install: (app) => installLlmUi(app, { i18n, external: false }) }],
      directives: { tooltip: {} },
    },
  });
  await flushPromises();
}
const text = () => document.body.textContent.replace(/\s+/g, " ");
const install = () => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Install"));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("the Visual C++ runtime missing: named, Microsoft's download linked, Install off — for either engine", async () => {
  const vc = { reason: "vc-runtime", missing: ["MSVCP140_ATOMIC_WAIT.dll"], url: "https://aka.ms/vs/17/release/vc_redist.x64.exe" };
  await mountCard("finder", { ...FINDER, runtime: { ok: false, error: "…", ...vc } });
  expect(text()).toContain("This computer doesn't have Microsoft's Visual C++ runtime (2015–2022), which this engine needs (MSVCP140_ATOMIC_WAIT.dll missing). Install it — Microsoft's download — then open the house again.");
  const link = document.querySelector("a[href='https://aka.ms/vs/17/release/vc_redist.x64.exe']");
  expect(link?.textContent).toBe("Microsoft's download");
  expect(link?.getAttribute("target")).toBe("_blank");
  expect(install().getAttribute("aria-disabled")).toBe("true"); // off, focusable
  wrapper.unmount();
  document.body.innerHTML = "";
  await mountCard("aiphoto", { ...AIPHOTO, available: false, need: { ...vc, missing: ["VCOMP140.DLL"] } });
  expect(text()).toContain("(VCOMP140.DLL missing)");
  expect(install().getAttribute("aria-disabled")).toBe("true"); // off, focusable
});

test("an old macOS or glibc, and the app's own onnxruntime.dll quarantined, are said in words", async () => {
  await mountCard("aiphoto", { ...AIPHOTO, available: false, need: { reason: "macos", need: "26.0", have: "15.6.1" } });
  expect(text()).toContain("The AI photo's engine needs macOS 26.0 or later, and this Mac has macOS 15.6.1: update macOS to use it.");
  expect(text()).not.toContain("about 20 seconds"); // no slow note on an engine that can't run
  wrapper.unmount();
  await mountCard("aiphoto", { ...AIPHOTO, available: false, need: { reason: "glibc", need: "2.38", have: "2.35" } });
  expect(text()).toContain("needs a Linux with glibc 2.38 or later (Ubuntu 24.04 and newer), and this one has glibc 2.35.");
  wrapper.unmount();
  await mountCard("finder", { ...FINDER, runtime: { ok: false, reason: "files-missing", files: ["onnxruntime.dll"], error: "…" } });
  expect(text()).toContain("A file of the part finder's engine is missing from the app (onnxruntime.dll) — an antivirus may have quarantined it.");
  expect(install().getAttribute("aria-disabled")).toBe("true"); // off, focusable
});

// The screens-and-keyboard review (2026-10-20): "macOS ." when the server didn't know this Mac's version;
// the install size in the kit's units and "Not enough room" in the server's decimal GB.
test("macOS's version is said only when the server knows it", async () => {
  await mountCard("aiphoto", { ...AIPHOTO, available: false, need: { reason: "macos", need: "26.0", have: "" } });
  expect(text()).toContain("The AI photo's engine needs macOS 26.0 or later: update macOS to use it.");
  expect(text()).not.toContain("macOS .");
});

test("not enough room is said in the unit the Install button's size is in (the kit's one formatter)", async () => {
  await mountCard("aiphoto", AIPHOTO);
  const engines = useEnginesStore();
  const problem = { type: "https://example.test/errors/disk-full", title: "Not enough room on the drive", detail: "needs 10.8 GB", needBytes: 10.8e9, freeBytes: 2.15e9 };
  engines.install = vi.fn(async () => {
    throw Object.assign(new Error("Not enough room on the drive"), { status: 507, problem });
  });
  expect(install().textContent).toContain("Install (8.9 GB)"); // 9.6e9 bytes, the kit's fmtBytes
  install().click();
  for (let i = 0; i < 3; i++) await flushPromises();
  const said = document.querySelector('[data-live-announcer] [aria-live="assertive"]')?.textContent || "";
  expect(said).toContain("Not enough room on the drive");
  expect(said).toContain("This needs 10.1 GB on the drive of the app's data folder, which has 2.0 GB free");
});

test("the AI photo's notes: slow on a graphics card that isn't NVIDIA's, too little memory, its files gone", async () => {
  await mountCard("aiphoto", { ...AIPHOTO, backend: "vulkan", slow: true, lowMemory: { needGb: 16, haveGb: 8 }, engineMissing: ["stable-diffusion.dll"] });
  expect(text()).toContain("The AI photo is quickest on an NVIDIA graphics card (about 20 seconds); on this computer's graphics card one AI photo may take several minutes.");
  expect(text()).toContain("This computer has 8 GB of memory, and one AI photo takes about 16 GB: here it may be very slow, or not finish.");
  expect(text()).toContain("Files of the AI photo's engine are gone (stable-diffusion.dll) — an antivirus may have removed them. Install puts them back.");
  expect(install().getAttribute("aria-disabled")).not.toBe("true"); // told, not stopped
  wrapper.unmount();
  await mountCard("aiphoto", { ...AIPHOTO, backend: "cpu", slow: true });
  expect(text()).toContain("about ten minutes");
  wrapper.unmount();
  await mountCard("aiphoto", AIPHOTO);
  expect(text()).not.toMatch(/several minutes|ten minutes|of memory|antivirus/);
});
