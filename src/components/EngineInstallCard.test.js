// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The part finder's install card mounted for real, on the status the server sends: what this computer lacks is said
// before anything downloads — the Visual C++ runtime with Microsoft's own download linked, the app's own engine file
// quarantined — and Install is off (2026-10-20, the thirteenth review). The AI photo's engine and model are the kit's:
// its "needs its engine" banner, tested in the kit.
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
const FINDER = { installed: false, downloadBytes: 3.36e9, runtime: { ok: true } };

let wrapper;
async function mountCard(status) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const engines = useEnginesStore();
  engines.finder = status;
  const Host = { render: () => [h(EngineInstallCard, { kind: "finder" }), h(LlmUiHosts)] };
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

test("the Visual C++ runtime missing: named, Microsoft's download linked, Install off", async () => {
  const vc = { reason: "vc-runtime", missing: ["MSVCP140_ATOMIC_WAIT.dll"], url: "https://aka.ms/vs/17/release/vc_redist.x64.exe" };
  await mountCard({ ...FINDER, runtime: { ok: false, error: "…", ...vc } });
  expect(text()).toContain("This computer doesn't have Microsoft's Visual C++ runtime (2015–2022), which this engine needs (MSVCP140_ATOMIC_WAIT.dll missing). Install it — Microsoft's download — then open the house again.");
  const link = document.querySelector("a[href='https://aka.ms/vs/17/release/vc_redist.x64.exe']");
  expect(link?.textContent).toBe("Microsoft's download");
  expect(link?.getAttribute("target")).toBe("_blank");
  expect(install().getAttribute("aria-disabled")).toBe("true"); // off, focusable
});

test("the app's own onnxruntime.dll quarantined is said in words", async () => {
  await mountCard({ ...FINDER, runtime: { ok: false, reason: "files-missing", files: ["onnxruntime.dll"], error: "…" } });
  expect(text()).toContain("A file of the part finder's engine is missing from the app (onnxruntime.dll) — an antivirus may have quarantined it.");
  expect(install().getAttribute("aria-disabled")).toBe("true"); // off, focusable
});

// The screens-and-keyboard review (2026-10-20): the install size in the kit's units and "Not enough room" in the
// server's decimal GB.
test("not enough room is said in the unit the Install button's size is in (the kit's one formatter)", async () => {
  await mountCard(FINDER);
  const engines = useEnginesStore();
  const problem = { type: "https://example.test/errors/disk-full", title: "Not enough room on the drive", detail: "needs 3.6 GB", needBytes: 3.6e9, freeBytes: 2.15e9 };
  engines.install = vi.fn(async () => {
    throw Object.assign(new Error("Not enough room on the drive"), { status: 507, problem });
  });
  expect(install().textContent).toContain("Install (3.1 GB)"); // 3.36e9 bytes, the kit's fmtBytes (a no-break space)
  await wrapper.findAll("button").find((b) => b.text().includes("Install")).trigger("click");
  for (let i = 0; i < 3; i++) await flushPromises();
  const said = document.querySelector('[data-live-announcer] [aria-live="assertive"]')?.textContent || "";
  expect(said).toContain("Not enough room on the drive");
  expect(said).toContain("This needs 3.4 GB on the drive of the app's data folder, which has 2.0 GB free");
});
