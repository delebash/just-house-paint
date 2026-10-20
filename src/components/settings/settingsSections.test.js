// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// Settings → About, Server and Storage — the kit's panels (AboutPanel, ServerPanel, StoragePanel;
// app-structure §11) as this app's Settings page wires them, mounted over a stand-in server and a
// stand-in desktop shell: what each shows, what each asks the server and the shell, that Storage's
// moves and clears ask first, that a token's address is what a browser elsewhere opens — and this
// app's own Storage rows: its houses, and Remove for an installed engine (asks first).
import { _resolveDialog, installLlmUi, LlmUiHosts, setServerToken } from "@delebash/ui";
import { QUASAR_TEST_OPTIONS } from "@delebash/ui/quasar/install.js";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import * as quasar from "quasar";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";

// the desktop shell as native.js reaches it (null fields: a browser, no shell)
const shell = { version: "", root: null, picked: null, relocated: [], keepRunning: [], oldCopies: [], removed: [], usedDefault: 0 };
vi.mock("../../services/native.js", () => ({
  shellVersion: () => shell.version,
  setKeepRunning: async (v) => shell.keepRunning.push(v),
  storageGetRoot: async () => shell.root,
  pickDirectory: async () => shell.picked,
  storageRelocate: async (to, options) => shell.relocated.push(options?.token ? [to, options.token] : to),
  storageOldCopies: async () => shell.oldCopies,
  storageRemoveOldCopy: async (root) => {
    shell.removed.push(root);
    shell.oldCopies = shell.oldCopies.filter((c) => c.root !== root);
    return shell.oldCopies;
  },
  storageUseDefault: async () => {
    shell.usedDefault++;
    shell.root = { ...shell.root, defaultThisStart: null };
  },
  desktopUpdater: () => null,
}));

const { i18n } = await import("../../i18n/index.js");
const { default: SettingsPage } = await import("../../pages/SettingsPage.vue");
const { useUiStore } = await import("../../stores/ui.js");

const QUASAR_COMPONENTS = Object.fromEntries(Object.entries(quasar).filter(([k, v]) => /^Q[A-Z]/.test(k) && v?.name));

// ── a stand-in server, in the real one's shapes
let server;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  server.calls.push([method, url.pathname, typeof init.body === "string" ? JSON.parse(init.body) : undefined]);
  if (url.pathname === "/v1/health") return Promise.resolve(json({ status: "ok", version: "1.2.3", dataDir: "D:/hp-data" }));
  if (url.pathname === "/v1/server-auth" && method === "GET") return Promise.resolve(json(server.auth));
  if (url.pathname === "/v1/server-auth" && method === "PUT") {
    server.auth = JSON.parse(init.body);
    return Promise.resolve(json(server.auth));
  }
  if (url.pathname === "/v1/disk/usage") return Promise.resolve(json(server.disk));
  if (url.pathname === "/v1/llm-runner/models-cache/clear") return Promise.resolve(json({ ok: true }));
  if (url.pathname === "/v1/segment/install" && method === "DELETE") {
    server.disk = { ...server.disk, extras: { ...server.disk.extras, partFinder: 0 } };
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.resolve(json({}));
}

let wrapper;
let pinia;
async function mountSettings(section) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/settings/:section?", component: SettingsPage, props: true }] });
  router.push(`/settings/${section}`);
  await router.isReady();
  pinia = createPinia();
  const Host = { render: () => [h(quasar.QLayout, { view: "hhh lpr fff" }, () => h(quasar.QPageContainer, () => h(RouterView))), h(LlmUiHosts)] };
  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [
        [quasar.Quasar, { ...QUASAR_TEST_OPTIONS, components: QUASAR_COMPONENTS }],
        i18n,
        pinia,
        router,
        { install: (app) => installLlmUi(app, { i18n, external: false }) },
      ],
      directives: { tooltip: {} },
    },
  });
  for (let i = 0; i < 3; i++) await flushPromises();
  return wrapper;
}
const text = () => document.body.textContent;
const button = (words) => [...document.body.querySelectorAll("button")].find((b) => b.textContent.includes(words));

beforeEach(() => {
  server = { calls: [], auth: { tokens: [], requireForLoopback: false }, disk: { modelsCache: 2e9, spawnLogs: 1e6, total: 3e9, diskFree: 5e10 } };
  Object.assign(shell, { version: "", root: null, picked: null, relocated: [], keepRunning: [], oldCopies: [], removed: [], usedDefault: 0 });
  setServerToken(""); // a token a test's window kept (the Server panel) isn't the next test's
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("About", () => {
  test("what the app is, the server's version and data folder; the desktop runtime only inside the desktop app", async () => {
    await mountSettings("about");
    expect(text()).toContain("See your house in real paint colors");
    expect(text()).toContain("1.2.3");
    expect(text()).toContain("D:/hp-data");
    expect(text()).toContain("github.com/delebash/just-house-paint");
    expect(text()).not.toContain("Electron");
    wrapper.unmount();
    shell.version = "44.7.0";
    await mountSettings("about");
    expect(text()).toContain("Electron 44.7.0");
  });
});

describe("Server", () => {
  test("tokens: read from the server, added, removed and required on this computer — each saved whole", async () => {
    server.auth = { tokens: ["abc"], requireForLoopback: false };
    await mountSettings("server");
    expect(text()).toContain("just-house-paint-server serve");
    expect(text()).toContain("abc");
    const input = document.body.querySelector("input[aria-label='Paste or generate a token']");
    input.value = "  def  ";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    button("Add token").click();
    await flushPromises();
    expect(server.auth).toEqual({ tokens: ["abc", "def"], requireForLoopback: false });
    document.body.querySelector("button[aria-label='Remove token']").click();
    await flushPromises();
    expect(server.auth.tokens).toEqual(["def"]);
    document.body.querySelector("[aria-label='Require a token on this computer too']").click();
    await flushPromises();
    expect(server.auth.requireForLoopback).toBe(true);
  });

  test("keep running is kept as a preference and told to the shell at once", async () => {
    await mountSettings("server");
    document.body.querySelector("[aria-label='Keep server running after the app closes']").click();
    await flushPromises();
    expect(shell.keepRunning).toEqual([true]);
    expect(useUiStore(pinia).keepServerRunning).toBe(true);
  });

  test("a token's address is the server's with ?token= — what a browser on another computer opens", async () => {
    server.auth = { tokens: ["s3cr3t"], requireForLoopback: false };
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await mountSettings("server");
    button("Copy the address with this token").click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?token=s3cr3t`);
  });
});

describe("Storage", () => {
  test("in a browser: the server's folder, no Change folder; the disk's parts in sizes", async () => {
    await mountSettings("storage");
    expect(text()).toContain("D:/hp-data");
    expect(text()).toContain("your houses and their photos"); // what this app saves, in the kit's sentence
    expect(button("Change folder")).toBeUndefined();
    expect(text()).toMatch(/\d(\.\d)? GB/); // the models cache, 2e9 bytes
  });

  test("Change folder asks first, then hands the folder to the shell; No moves nothing", async () => {
    shell.root = { root: "C:/old", default: "C:/old", portable: false };
    shell.picked = "D:/new";
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    await mountSettings("storage");
    button("Change folder").click();
    await flushPromises();
    _resolveDialog(false);
    await flushPromises();
    expect(shell.relocated).toEqual([]);
    button("Change folder").click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(shell.relocated).toEqual(["D:/new"]);
  });

  // the fifteenth review (2026-10-20): the question names the folder the move makes and the apps sharing this
  // app's models; the window's token goes with the data; the old copy is shown and removed only when asked
  test("Change folder's question names the folder it makes and the apps sharing the models; the token goes along", async () => {
    shell.root = { root: "C:\\Data\\Old", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Just House Paint", defaultThisStart: null };
    shell.picked = "D:\\Folders\\";
    server.disk = { ...server.disk, sharedWith: ["JustWrite"] };
    setServerToken("s3cr3t");
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    await mountSettings("storage");
    button("Change folder").click();
    await flushPromises();
    expect(text()).toContain("is copied to D:\\Folders\\Just House Paint, and the app restarts on it");
    expect(text()).toContain("JustWrite use this app's AI models: they keep using the old copy until you remove it");
    _resolveDialog(true);
    await flushPromises();
    expect(shell.relocated).toEqual([["D:\\Folders\\", "s3cr3t"]]);
  });

  test("Move back to the default folder: offered while the data is elsewhere, the default itself the target", async () => {
    shell.root = { root: "D:\\Folders\\Just House Paint", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Just House Paint", defaultThisStart: null };
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    await mountSettings("storage");
    button("Move back to the default folder").click();
    await flushPromises();
    expect(text()).toContain("is copied to C:\\App\\data, and the app restarts on it");
    _resolveDialog(true);
    await flushPromises();
    expect(shell.relocated).toEqual(["C:\\App\\data"]);
    // at the default, nothing to move back to
    wrapper.unmount();
    shell.root = { ...shell.root, root: "C:\\App\\data", atDefault: true };
    await mountSettings("storage");
    expect(button("Move back to the default folder")).toBeUndefined();
  });

  test("the old copy a move left: its folder and size, removed only after asking", async () => {
    shell.root = { root: "D:\\New\\Just House Paint", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Just House Paint", defaultThisStart: null };
    shell.oldCopies = [{ root: "C:\\App\\data", bytes: 12e9 }];
    // the row's own button (the confirm's says the same)
    const removeOld = () => [...document.body.querySelectorAll(".ui-formgrid button")].find((b) => b.textContent.includes("Remove the old copy"));
    await mountSettings("storage");
    expect(text()).toContain("Old copy");
    expect(text()).toContain("C:\\App\\data");
    expect(text()).toMatch(/1[12](\.\d)? GB/);
    removeOld().click();
    await flushPromises();
    expect(text()).toContain("This deletes the copy of the data that stayed in C:\\App\\data");
    _resolveDialog(false);
    await flushPromises();
    expect(shell.removed).toEqual([]);
    removeOld().click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(shell.removed).toEqual(["C:\\App\\data"]);
    expect(removeOld()).toBeUndefined();
  });

  test("a start on the default folder because the moved-to one can't be used: Use the default folder from now on", async () => {
    shell.root = { root: "C:\\App\\data", default: "C:\\App\\data", portable: true, atDefault: true, folderName: "Just House Paint", defaultThisStart: { folder: "E:\\Just House Paint" } };
    await mountSettings("storage");
    expect(text()).toContain("This start uses the default folder: E:\\Just House Paint can't be used now.");
    expect(button("Move back to the default folder")).toBeUndefined();
    button("Use the default folder from now on").click();
    await flushPromises();
    expect(text()).toContain("The app stops looking for E:\\Just House Paint and opens on C:\\App\\data from now on.");
    _resolveDialog(true);
    await flushPromises();
    expect(shell.usedDefault).toBe(1);
    expect(text()).not.toContain("This start uses the default folder");
  });

  test("the data-dir variable names the folder: no Change folder or Move back, the variable named", async () => {
    shell.root = { root: "D:\\e2e-data", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Just House Paint", defaultThisStart: null, setBy: "JUST_HOUSE_PAINT_DATA_DIR" };
    await mountSettings("storage");
    expect(text()).toContain("This data folder is set by JUST_HOUSE_PAINT_DATA_DIR — change it there.");
    expect(button("Change folder")).toBeUndefined();
    expect(button("Move back to the default folder")).toBeUndefined();
  });

  test("an old copy used after the move says when, beside its button and in the question; a start on an old copy is told", async () => {
    const changedAt = new Date(2026, 9, 21, 14, 30).getTime();
    shell.root = {
      root: "C:\\App\\data",
      default: "C:\\App\\data",
      portable: true,
      atDefault: true,
      folderName: "Just House Paint",
      defaultThisStart: null,
      oldCopyOf: { root: "E:\\Just House Paint", movedAt: changedAt - 86_400_000 },
    };
    shell.oldCopies = [{ root: "F:\\Older", bytes: 1e9, movedAt: changedAt - 3_600_000, changedAt }];
    await mountSettings("storage");
    expect(text()).toContain("This folder holds the old copy of the data, left here when the data moved to E:\\Just House Paint");
    const said = "The old copy was used after the move — last changed";
    const times = () => text().split(said).length - 1;
    expect(times()).toBe(1); // beside its button
    expect(text()).toContain("Removing it removes that work too; move what you need first.");
    const removeOld = () => [...document.body.querySelectorAll(".ui-formgrid button")].find((b) => b.textContent.includes("Remove the old copy"));
    removeOld().click();
    await flushPromises();
    expect(times()).toBe(2); // and in the question
    _resolveDialog(false);
    await flushPromises();
    expect(shell.removed).toEqual([]);
  });

  test("clearing the models asks first, then clears and reads the sizes again", async () => {
    await mountSettings("storage");
    const before = server.calls.filter((c) => c[1] === "/v1/disk/usage").length;
    [...document.body.querySelectorAll("button")].find((b) => b.textContent.trim() === "Clear…").click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(server.calls.some((c) => c[0] === "POST" && c[1] === "/v1/llm-runner/models-cache/clear")).toBe(true);
    expect(server.calls.filter((c) => c[1] === "/v1/disk/usage").length).toBe(before + 1);
  });
});

describe("Storage — this app's own rows", () => {
  test("its houses and engines in sizes; Remove frees an installed engine after asking, and the sizes are read again", async () => {
    server.disk = { ...server.disk, extras: { houses: 5e6, partFinder: 3.4e9, aiPhoto: 0 } };
    await mountSettings("storage");
    expect(text()).toContain("Your houses' photos");
    // the grid's own Remove buttons (the confirm's button says Remove too)
    const removes = () => [...document.body.querySelectorAll(".lu-storage__grid button")].filter((b) => b.textContent.trim() === "Remove");
    expect(removes()).toHaveLength(1); // the AI photo isn't installed: nothing to remove
    removes()[0].click();
    await flushPromises();
    _resolveDialog(false);
    await flushPromises();
    expect(server.calls.some((c) => c[0] === "DELETE")).toBe(false);
    removes()[0].click();
    await flushPromises();
    const reads = server.calls.filter((c) => c[1] === "/v1/disk/usage").length;
    _resolveDialog(true);
    // the Remove, then the sizes read again
    for (let i = 0; i < 30 && server.calls.filter((c) => c[1] === "/v1/disk/usage").length === reads; i++) await flushPromises();
    await flushPromises();
    expect(server.calls.some((c) => c[0] === "DELETE" && c[1] === "/v1/segment/install")).toBe(true);
    expect(removes()).toHaveLength(0);
  });
});
