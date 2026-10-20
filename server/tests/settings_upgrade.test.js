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
  "finder.parts": "f8ba077756a487ab",
  "finder.priority": "97688972545dc716",
  "schemes.roleParts": "9815d5ff99ae7e7a",
  "aiphoto.compose": "5afc0446d8b847fa",
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
  // an earlier default, as an install made before it holds it: the parts list of v0.1.0–v0.1.2, before
  // the doors' casings, the on-the-house share and the decorations
  const earlier = structuredClone(SETTING_DEFAULTS["finder.parts"])
    .filter((p) => p.key !== "decor")
    .map((p) => {
      if (p.key !== "trim") return p;
      const { onHouse: _, ...rest } = p;
      return { ...rest, prompts: ["trim", "fascia"] };
    });
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
