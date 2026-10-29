// SPDX-License-Identifier: MIT
// Accessibility — every page of the REAL desktop app against WCAG 2.2 AA (app-structure §17), checked by axe-core,
// Deque's engine and the standard automated check (playwright.dev/docs/accessibility-testing), in the light theme
// and the dark one: the nav's pages, and a house's page on each of its panel's tabs (a photo added through the
// window, as the smoke suite adds one). axe finds what a machine can — names, roles, contrast, ARIA misuse; the
// keyboard path through a screen and its reading order stay a person's review. Hermetic like the smoke suite
// (lib/driver.js). The kit template's file (template/e2e/tests/a11y.test.js) with this app's pages.
//
// Before: `npm run build:unpacked` (the harness drives what was last built). Run: `npm test` from the app's root.

import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { AxeBuilder } from "@axe-core/playwright";
import { Driver } from "../lib/driver.js";

// WCAG 2.0, 2.1 and 2.2, levels A and AA — axe's tags (github.com/dequelabs/axe-core/blob/develop/doc/API.md)
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PAGES = [
  { nav: "Your houses", url: /#\/$/ },
  { nav: "Paint colors", url: /#\/colors$/ },
  { nav: "AI Settings", url: /#\/ai$/ },
  { nav: "App Settings", url: /#\/settings/ },
];
// a house's page: its panel's tabs (HousePage.vue)
const TABS = ["Parts", "Colors", "Schemes", "Designs"];

// The smoke suite's 48×36 PNG — sky, a beige wall, grass.
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
  // a house to check: added through the window; the first one brings the once-ever AI offer, skipped
  await d.navigate("#/");
  await page.locator('.houses__picker input[type="file"]').setInputFiles({ name: "my-house.png", mimeType: "image/png", buffer: PHOTO });
  await page.waitForURL(/#\/house\/[A-Za-z0-9-]+$/);
  const offer = page.locator(".ui-modal", { hasText: "Set up AI features" });
  await offer.waitFor();
  await offer.locator("button", { hasText: "Skip for now" }).click();
  await offer.waitFor({ state: "detached" });
});

after(async () => {
  await d.close();
});

/** axe's violations on what the window shows now, as lines a failure can be read from. Legacy mode: axe otherwise
 *  gathers its results in a blank page it opens, and Playwright's Electron opens none ("Target.createTarget: Not
 *  supported" — measured by docgen's session on its built app, 2026-10-29); legacy mode skips that page and only
 *  loses cross-origin frames, which the app has none of (axe-core-npm's playwright README, setLegacyMode). */
async function violations() {
  const { violations: found } = await new AxeBuilder({ page }).withTags(TAGS).setLegacyMode().analyze();
  return found.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const scheme of ["light", "dark"]) {
  test(`every page meets WCAG 2.2 AA in the ${scheme} theme`, async () => {
    await page.emulateMedia({ colorScheme: scheme }); // the theme follows the system until a user picks one
    for (const p of PAGES) {
      await page.locator(".navlink", { hasText: p.nav }).click();
      await page.waitForURL(p.url);
      await page.locator(".pane-h1").first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), scheme);
      assert.deepEqual(await violations(), [], `${p.nav}, ${scheme}`);
    }
    await page.locator(".navlink", { hasText: "Your houses" }).click();
    await page.locator(".houses__open").first().click();
    await page.waitForURL(/#\/house\/[A-Za-z0-9-]+$/);
    await page.locator(".pane-h1", { hasText: "my house" }).waitFor();
    for (const tab of TABS) {
      await page.getByRole("tab", { name: tab }).click();
      assert.deepEqual(await violations(), [], `the house's ${tab} tab, ${scheme}`);
    }
  });
}
