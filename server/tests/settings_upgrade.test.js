// SPDX-License-Identifier: MIT
// A setting still at an earlier default takes today's; one its owner edited is never touched — and a
// default can't change without its old fingerprint being kept (database/previous_defaults.js).
import { afterEach, expect, test } from "vitest";
import { openAppDatabase } from "../src/database/index.js";
import { fingerprint, PREVIOUS_DEFAULTS } from "../src/database/previous_defaults.js";
import { SETTING_DEFAULTS, seedSettings, upgradeSettings } from "../src/database/seed.js";
import { getSetting, setSetting } from "../src/database/settings.js";
import { tmpDir } from "./helpers.js";

const open = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close(); // Windows can't delete an open file
});

// Today's defaults. A change here means a default changed: add the OLD fingerprint to
// PREVIOUS_DEFAULTS (so installs still holding it get the new one), then update this line.
const TODAY = {
  "finder.parts": "b77e3afbbe282820",
  "finder.priority": "69c2dcc097840fab",
  "schemes.roleParts": "ab90c1fb04750be9",
  "aiphoto.compose": "2349559042b9098d",
  "schemes.harmony": "82fac382590bdac2",
};

test("today's defaults are the ones this test knows, and none of them is listed as earlier", () => {
  for (const [key, print] of Object.entries(TODAY)) {
    expect(fingerprint(SETTING_DEFAULTS[key]), `${key}'s default changed — keep its old fingerprint in PREVIOUS_DEFAULTS`).toBe(print);
    expect(PREVIOUS_DEFAULTS[key]).not.toContain(print);
  }
});

test("a setting still at an earlier default takes today's; an edited one, and today's, are left alone", () => {
  const db = openAppDatabase(tmpDir());
  open.push(db);
  seedSettings(db);
  // an earlier default, as an install made before it holds it: the parts list of commit 8972a89
  const earlier = structuredClone(SETTING_DEFAULTS["finder.parts"]).map((p) =>
    p.key === "windows"
      ? { ...p, prompts: ["window"], threshold: 0.5 }
      : p.key === "windowTrim"
        ? { key: "windowTrim", labelKey: "parts.windowTrim", prompts: ["window trim"], threshold: 0.5, paintable: true, group: "trim" }
        : p,
  );
  expect(PREVIOUS_DEFAULTS["finder.parts"]).toContain(fingerprint(earlier));
  setSetting(db, "finder.parts", earlier);
  // the owner's own priority: one change from today's
  const mine = [...SETTING_DEFAULTS["finder.priority"]].reverse();
  setSetting(db, "finder.priority", mine);
  expect(upgradeSettings(db)).toEqual(["finder.parts"]);
  expect(getSetting(db, "finder.parts")).toEqual(SETTING_DEFAULTS["finder.parts"]);
  expect(getSetting(db, "finder.priority")).toEqual(mine);
  expect(upgradeSettings(db)).toEqual([]); // nothing left to upgrade
});
