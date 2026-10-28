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
const shell = { version: "", root: null, picked: null, relocated: [], keepRunning: [], oldCopies: [], removed: [], forgotten: [], oldCopiesAsked: [], usedDefault: 0 };
vi.mock("../../services/native.js", () => ({
  shellVersion: () => shell.version,
  setKeepRunning: async (v) => shell.keepRunning.push(v),
  storageGetRoot: async () => shell.root,
  pickDirectory: async () => shell.picked,
  storageRelocate: async (to, options) => shell.relocated.push(options?.token ? [to, options.token] : to),
  storageOldCopies: async (options) => {
    shell.oldCopiesAsked.push(options ?? {});
    return shell.oldCopies;
  },
  storageRemoveOldCopy: async (root) => {
    shell.removed.push(root);
    shell.oldCopies = shell.oldCopies.filter((c) => c.root !== root);
    return shell.oldCopies;
  },
  storageForgetOldCopy: async (root) => {
    shell.forgotten.push(root);
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
  if (url.pathname === "/v1/data/restore") return Promise.resolve(json({ ...(server.restoreAnswer || {}), ok: true }));
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
  Object.assign(shell, { version: "", root: null, picked: null, relocated: [], keepRunning: [], oldCopies: [], removed: [], forgotten: [], oldCopiesAsked: [], usedDefault: 0 });
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
    expect(text()).toMatch(/\d(\.\d)? GB/); // the models cache, 2e9 bytes (the kit's fmtBytes: a no-break space)
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
  // app's models (the shell carries the window's token); the old copy is shown and removed only when asked
  test("Change folder's question names the folder it makes and the apps sharing the models (the shell carries the token itself)", async () => {
    shell.root = { root: "C:\\Data\\Old", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Just House Paint", defaultThisStart: null };
    shell.picked = "D:\\Folders\\";
    server.disk = { ...server.disk, sharedWith: ["JustWrite"] };
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    await mountSettings("storage");
    button("Change folder").click();
    await flushPromises();
    expect(text()).toContain("is copied to D:\\Folders\\Just House Paint, and the app restarts on it");
    expect(text()).toContain("JustWrite use this app's AI models: they keep using the old copy until you remove it");
    _resolveDialog(true);
    await flushPromises();
    expect(shell.relocated).toEqual(["D:\\Folders\\"]);
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
    expect(text()).toMatch(/1[12](\.\d)? GB/);
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
    expect(text()).toContain("This start uses the default folder: your data is in E:\\Just House Paint, which isn't there now — connect it and restart, or use the default folder from now on.");
    // one sentence, the folder named once (the nineteenth review's screens: three times, five lines at 960)
    expect(document.body.querySelector(".lu-storage__banner").textContent.split("E:\\Just House Paint").length - 1).toBe(1);
    expect(button("Move back to the default folder")).toBeUndefined();
    button("Use the default folder from now on").click();
    await flushPromises();
    expect(text()).toContain("The app stops looking for E:\\Just House Paint and opens on C:\\App\\data from now on.");
    _resolveDialog(true);
    await flushPromises();
    expect(shell.usedDefault).toBe(1);
    expect(text()).not.toContain("This start uses the default folder");
  });

  // the sixteenth review (2026-10-20): no move from a start that runs elsewhere than the data; an old copy on a drive
  // that isn't there; Move back said, not offered, while the default holds the old copy; Remove names the apps
  // sharing the models
  test("a start on the default folder this time: no Change folder or Move back — the data is elsewhere, said", async () => {
    shell.root = { root: "C:\\App\\data", default: "C:\\App\\data", portable: true, atDefault: true, folderName: "Just House Paint", defaultThisStart: { folder: "E:\\Just House Paint" } };
    await mountSettings("storage");
    expect(text()).toContain("your data is in E:\\Just House Paint, which isn't there now — connect it and restart, or use the default folder from now on.");
    expect(button("Change folder")).toBeUndefined();
    expect(button("Move back to the default folder")).toBeUndefined();
    // the variable's folder missing: the variable's own words off too, and no "from now on"
    wrapper.unmount();
    shell.root = { ...shell.root, setBy: "VARNAME" };
    await mountSettings("storage");
    expect(text()).toContain("your data is in E:\\Just House Paint, which isn't there now — connect it and restart.");
    expect(text()).not.toContain("set by VARNAME");
    expect(button("Use the default folder from now on")).toBeUndefined();
  });

  // the seventeenth review: "connect it and restart" said when the data's folder is connected and a restart won't help
  test("the data's folder connected: restart to use it; the variable naming the old copy: change it to the data's folder", async () => {
    shell.root = { root: "C:\\App\\data", default: "C:\\App\\data", portable: true, atDefault: true, folderName: "Just House Paint", defaultThisStart: { folder: "E:\\Just House Paint", connected: true } };
    await mountSettings("storage");
    expect(text()).toContain("This start uses the default folder; your data is in E:\\Just House Paint, which can be used again — restart the app to use it.");
    wrapper.unmount();
    shell.root = {
      root: "C:\\App\\data",
      default: "C:\\App\\data",
      portable: true,
      atDefault: true,
      folderName: "Just House Paint",
      defaultThisStart: null,
      setBy: "JUST_HOUSE_PAINT_DATA_DIR",
      oldCopyOf: { root: "E:\\Just House Paint", movedAt: 1, connected: true },
    };
    await mountSettings("storage");
    expect(text()).toContain("JUST_HOUSE_PAINT_DATA_DIR names this old copy — what you change here isn't in your data, which moved to E:\\Just House Paint: change JUST_HOUSE_PAINT_DATA_DIR to that folder.");
    expect(button("Change folder")).toBeUndefined();
  });

  // the eighteenth review's s11: "not connected" had no way out — now Not found, never removed, and Forget (asks first,
  // drops the record only)
  test("an old copy that isn't found: Not found, no Remove, Forget asks then drops it; Move back said while the default holds one", async () => {
    shell.root = { root: "D:\\New\\Just House Paint", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Just House Paint", defaultThisStart: null };
    shell.oldCopies = [
      { root: "F:\\Stick\\Just House Paint", bytes: null, movedAt: 1, changedAt: null, connected: false, cause: "absent" },
      { root: "C:\\App\\data", bytes: 1e9, movedAt: 1, changedAt: null, connected: true },
    ];
    server.disk = { ...server.disk, sharedWith: ["JustWrite"] };
    await mountSettings("storage");
    expect(text()).toContain("Not found");
    expect(text()).toContain("Its folder isn't there — its drive unplugged, or the folder renamed or deleted. Connect it to remove it, or Forget it: the app stops listing it, and nothing on any drive is touched.");
    const removes = () => [...document.body.querySelectorAll(".ui-formgrid button")].filter((b) => b.textContent.includes("Remove the old copy"));
    expect(removes().length).toBe(1); // only the found one's
    expect(button("Move back to the default folder")).toBeUndefined();
    expect(text()).toContain("To move the data back to the default folder, remove the old copy there first.");
    removes()[0].click();
    await flushPromises();
    expect(text()).toContain("JustWrite use this app's AI models: if they still use the old copy's, they download their models again.");
    _resolveDialog(false);
    await flushPromises();
    // Forget: asked first; No keeps it
    button("Forget").click();
    await flushPromises();
    expect(text()).toContain("The app stops listing the old copy in F:\\Stick\\Just House Paint. Nothing on any drive is touched");
    _resolveDialog(false);
    await flushPromises();
    expect(shell.forgotten).toEqual([]);
    button("Forget").click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(shell.forgotten).toEqual(["F:\\Stick\\Just House Paint"]);
    expect(text()).not.toContain("Not found");
    expect(shell.removed).toEqual([]);
    // the row and its button gone: the focus on the next copy's button, never dropped on the page; said as forgotten
    expect(document.activeElement?.textContent).toContain("Remove the old copy");
    const said = () => [...document.body.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent).join(" ");
    await vi.waitFor(() => expect(said()).toContain("Forgotten"));
  });

  // the nineteenth review: "Not found" said "connect its drive" whatever the cause; a share that didn't answer had no
  // way but Forget; after the last row's Forget the focus fell on the page
  test("each cause in its words; one that didn't answer offers Try again; the last one forgotten, the focus on Change folder", async () => {
    shell.root = { root: "D:\\New\\Just House Paint", default: "C:\\App\\data", portable: false, atDefault: false, folderName: "Just House Paint", defaultThisStart: null };
    shell.oldCopies = [
      { root: "\\\\nas\\share\\Just House Paint", bytes: null, movedAt: 1, changedAt: null, connected: false, cause: "slow" },
      { root: "G:\\Just House Paint", bytes: null, movedAt: 1, changedAt: null, connected: false, cause: "other" },
    ];
    await mountSettings("storage");
    // said once: the row's label, then its note without the same words again (the twentieth review)
    expect(text().split("Didn't answer just now").length - 1).toBe(1);
    expect(text()).toContain("A network folder offline, or a drive waking? Try again in a moment, or Forget it");
    expect(text()).toContain("The folder there now isn't this copy — another drive in its place, or a folder copied by hand — so it isn't removed.");
    // Try again: looked at now
    shell.oldCopies = [shell.oldCopies[1]];
    button("Try again").click();
    await flushPromises();
    expect(shell.oldCopiesAsked.at(-1)).toEqual({ again: true });
    expect(text()).not.toContain("Didn't answer just now");
    // the last one forgotten: the focus on Change folder
    button("Forget").click();
    await flushPromises();
    _resolveDialog(true);
    await flushPromises();
    expect(document.activeElement?.textContent).toContain("Change folder");
  });

  // the eighteenth review's s16: "restart the app to use it" for a folder that is there but the start's check refuses
  test("the data's folder there but not usable: the shell's reason, and restart once it can", async () => {
    shell.root = {
      root: "C:\\App\\data",
      default: "C:\\App\\data",
      portable: true,
      atDefault: true,
      folderName: "Just House Paint",
      defaultThisStart: { folder: "E:\\Just House Paint", connected: false, problem: "the app isn't allowed to write there" },
    };
    await mountSettings("storage");
    expect(text()).toContain("This start uses the default folder: your data is in E:\\Just House Paint, which can't be used now (the app isn't allowed to write there) — put that right and restart, or use the default folder from now on.");
    expect(text()).not.toContain("restart the app to use it");
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
    expect(text()).toContain("This folder holds an old copy — what you change here isn't in your data, which moved to E:\\Just House Paint: that folder isn't there now — connect it and restart, or use the default folder from now on.");
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

describe("Storage — this app's own row", () => {
  test("its houses in a size; the engines and models are the kit's buckets (no Remove of the app's own)", async () => {
    server.disk = { ...server.disk, extras: { houses: 5e6 } };
    await mountSettings("storage");
    expect(text()).toContain("Your houses' photos");
    expect(text()).not.toContain("The part finder");
    expect([...document.body.querySelectorAll(".lu-storage__grid button")].filter((x) => x.textContent.trim() === "Remove")).toHaveLength(0);
  });
});

// the nineteenth review: a backup from an older version restores, the settings that don't fit this version set back to
// their defaults and named by the server — said after the reload the restore starts
describe("Backups", () => {
  test("a restore whose settings didn't fit: the keys named in a toast after the reload; none, nothing said", async () => {
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    sessionStorage.clear();
    server.restoreAnswer = { resetSettings: ["finder.houseMargin", "photos.jpegQuality"] };
    await mountSettings("backups");
    const restore = async () => {
      const input = document.body.querySelector('input[type="file"]');
      Object.defineProperty(input, "files", { value: [new File(["PK"], "backup.zip", { type: "application/zip" })], configurable: true });
      input.dispatchEvent(new Event("change"));
      await flushPromises();
      _resolveDialog(true);
      for (let i = 0; i < 3; i++) await flushPromises();
    };
    await restore();
    expect(server.calls.some((c) => c[1] === "/v1/data/restore")).toBe(true);
    // named as General and Advanced show them, not by key — each in quotes, so a name's own comma isn't the list's
    const said = "Some settings in the backup didn't fit this version and were set back to their defaults: “Parts reach past the house by (share of the photo)” and “JPEG quality”.";
    expect(JSON.parse(sessionStorage.getItem("kit.dataManagement.afterRestore"))).toEqual({ message: said });
    // the page again after its reload: said then (a toast — its words in the page and to a screen reader)
    wrapper.unmount();
    await mountSettings("backups");
    await vi.waitFor(() => expect(document.body.textContent).toContain(said));
    const spoken = () => [...document.body.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent).join(" ");
    await vi.waitFor(() => expect(spoken()).toContain(said));
    expect(sessionStorage.getItem("kit.dataManagement.afterRestore")).toBe(null);
    // a backup that fit: nothing kept to say
    server.restoreAnswer = { resetSettings: [] };
    await restore();
    expect(sessionStorage.getItem("kit.dataManagement.afterRestore")).toBe(null);
  });
});
