// SPDX-License-Identifier: MIT
// The smoke suite — the REAL desktop app (Electron, the built UI from app://) driven through
// Playwright (app-structure §10, §18). It asserts the CONTRACT, not pixels: the shell mounts, the
// nav works, the AI status button and the AI-tasks toggle behave, a photo is added through the
// window and reaches the server, the house opens and offers the part finder's install (a fresh data
// folder has no engines), the once-ever AI offer comes once, Paint colors lists the launch brands,
// Settings shows its sections in their order. Hermetic (lib/driver.js): a temp data folder, the
// harness's own server, the shell's <ID>_DEV_NO_SERVER=1. One launch shared by the tests, in order.
//
// Before: `npm run build:unpacked` (the harness drives what was last built). Run: `npm test` from
// the app's root.

import { strict as assert } from "node:assert";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { Driver, waitFor } from "../lib/driver.js";

// The version About shows: the app's own, where `npm run bump` writes it (a literal broke on the first bump).
const VERSION = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

// A 48×36 PNG — sky, a beige wall, grass — enough for the server to make its copies.
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAkCAIAAABAJy5dAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAY0lEQVRYhe2UQQ3AMAwDg64giqRIgqTvwEj+RjIWSzadZACnk23zW6Ni7QQOUGHo0iFnZdV+P84x1mcNKWNUrJ1AAAWGkg6JlUX7/YhjDAwlHdI7K9tnjYq1E2yAFobOrzv0AOh9AsNw1hDnAAAAAElFTkSuQmCC",
  "base64",
);

const d = new Driver();
let page;

before(async () => {
  await d.launch();
  page = d.page;
  await page.waitForSelector(".shell", { timeout: 30_000 });
});

after(async () => {
  await d.close();
});

test("the window is the app's", async () => {
  assert.equal(await page.title(), "Just House Paint");
  assert.match(page.url(), /^app:\/\/justhousepaint\//);
});

test("the shell mounts: the title bar, the nav and the AI status button", async () => {
  await page.locator(".titlebar").waitFor();
  await page.locator(".shell__nav").waitFor();
  const labels = await page.locator(".shell__nav .navlink").allTextContents();
  for (const word of ["Your houses", "Paint colors", "AI Settings", "App Settings", "AI tasks"]) {
    assert.ok(labels.some((l) => l.includes(word)), `the nav has "${word}" (${labels.join(" | ")})`);
  }
  assert.equal(await page.locator(".titlebar .ai-status-btn").count(), 1, "the kit's AiStatusButton is in the title bar");
});

test("the boot plate is gone once the app shows", async () => {
  assert.equal(await page.locator("#app-boot").count(), 0);
});

test("the nav works: Paint colors, AI Settings and App Settings open their pages", async () => {
  await page.locator(".navlink", { hasText: "Paint colors" }).click();
  await page.waitForURL(/#\/colors$/);
  await page.locator(".pane-h1", { hasText: "Paint colors" }).waitFor();

  await page.locator(".navlink", { hasText: "AI Settings" }).click();
  await page.waitForURL(/#\/ai$/);
  await page.locator(".pane-h1", { hasText: "Providers, models and usage" }).waitFor();

  await page.locator(".navlink", { hasText: "App Settings" }).click();
  await page.waitForURL(/#\/settings/);
  await page.locator(".pane-h1", { hasText: "Settings" }).waitFor();
});

test("the AI-tasks row is a real toggle: it opens, stays open, and a second click closes it", async () => {
  // Behaviour, not presence: without the kit's navAttrs the opening click was also the panel's
  // outside-click, and it shut at once (docgen, 2026-08-03).
  const row = page.locator(".navlink", { hasText: "AI tasks" });
  await row.click();
  await page.waitForTimeout(400); // long enough for a wrong dismiss to have fired
  assert.equal(await page.locator('[role="dialog"][aria-label="AI tasks"]').count(), 1, "the panel opens and stays open");
  await row.click();
  await page.locator('[role="dialog"][aria-label="AI tasks"]').waitFor({ state: "detached" });
});

test("Settings shows General and Advanced, then the family's seven sections in canon order", async () => {
  await d.navigate("#/settings/general");
  await page.locator(".set-shell").waitFor();
  const tabs = (await page.locator(".set-shell [role=tab]").allTextContents()).map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(tabs, ["General", "Advanced", "Appearance", "Backups", "Storage", "Server", "Logs", "Updates", "About"]);
  await page.locator(".card h2", { hasText: "Photos" }).waitFor(); // the app's own settings, from the server
  await d.navigate("#/settings/about");
  await page.locator(".ui-formgrid td", { hasText: VERSION }).waitFor(); // the version, from the server (the kit's AboutPanel)
});

test("Paint colors lists the launch brands, none loaded in a fresh folder", async () => {
  await d.navigate("#/colors");
  await page.locator(".ui-table-row", { hasText: "Behr" }).waitFor();
  const rows = await page.locator(".ui-table-row").count();
  assert.equal(rows, 7, "the seven launch brands");
  assert.equal((await d.api("/brands")).filter((b) => b.paintCount > 0).length, 0, "the app ships no brand data");
});

test("a photo is added through the window, kept by the server, the house opens, and the AI offer comes once", async () => {
  await d.navigate("#/");
  await page.locator(".ui-empty", { hasText: "No houses yet" }).waitFor();

  await page.locator('.houses__picker input[type="file"]').setInputFiles({ name: "my-house.png", mimeType: "image/png", buffer: PHOTO });
  await page.waitForURL(/#\/house\/[A-Za-z0-9-]+$/);
  await page.locator(".pane-h1", { hasText: "my house" }).waitFor(); // the server names it from the file
  // a fresh data folder has no part finder: the house offers its install
  await page.locator(".engine h2", { hasText: "Install the part finder" }).waitFor();

  const houses = await d.api("/houses");
  assert.equal(houses.length, 1);
  assert.equal(houses[0].name, "my house");
  assert.equal(houses[0].width, 48);

  // the first house is this app's moment for the once-ever AI offer (no AI set up in a fresh folder)
  const offer = page.locator(".ui-modal", { hasText: "Set up AI features" });
  await offer.waitFor();
  await offer.locator("button", { hasText: "Skip for now" }).click();
  await offer.waitFor({ state: "detached" });
  // the kit batches preference writes: wait for this one to reach the server
  const kept = await waitFor(async () => (await d.api("/prefs")).aiOfferShown === true);
  assert.ok(kept, "the flag is kept by the server");

  // a second house: no offer again
  await d.navigate("#/");
  await page.locator(".houses__card").first().waitFor();
  await page.locator('.houses__picker input[type="file"]').setInputFiles({ name: "second.png", mimeType: "image/png", buffer: PHOTO });
  await page.locator(".pane-h1", { hasText: "second" }).waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".ui-modal", { hasText: "Set up AI features" }).count(), 0, "the offer never comes twice");

  // Your houses lists both, newest first
  await d.navigate("#/");
  await waitFor(async () => (await page.locator(".houses__name").count()) === 2, { what: "two house cards" });
  assert.deepEqual((await page.locator(".houses__name").allTextContents()).map((s) => s.trim()), ["second", "my house"]);
});

// Save image paints in a module worker loaded from app:// (2026-10-20: the full-size paint left the main
// thread) — the worker must load there and write a real JPEG where the Save dialog says (stubbed in main)
test("Save image paints in its worker and writes the JPEG where the dialog says", async () => {
  const out = path.join(os.tmpdir(), `just-house-paint-e2e-${Date.now()}.jpg`);
  await d.app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, out);
  await d.navigate("#/");
  await page.locator(".houses__card").first().click();
  await page.waitForURL(/#\/house\/[A-Za-z0-9-]+$/);
  const save = page.locator("button", { hasText: "Save image" });
  await waitFor(async () => !(await save.isDisabled()), { what: "Save image ready" });
  await save.click();
  try {
    await waitFor(async () => existsSync(out) && statSync(out).size > 100, { what: "the saved JPEG", timeout: 30_000 });
    assert.deepEqual([...readFileSync(out).subarray(0, 3)], [0xff, 0xd8, 0xff], "a JPEG");
  } finally {
    rmSync(out, { force: true });
  }
});
