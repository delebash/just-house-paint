// SPDX-License-Identifier: MIT
// A setting still at an earlier default takes today's; one its owner edited is never touched — and a
// default can't change without its old fingerprint being kept (database/previous_defaults.js).
import { defaultsFingerprints, fingerprint } from "@delebash/core/platform";
import { afterEach, expect, test } from "vitest";
import { openAppDatabase } from "../src/database/index.js";
import { PREVIOUS_DEFAULTS } from "../src/database/previous_defaults.js";
import { SETTING_DEFAULTS, seedSettings, upgradeSettings } from "../src/database/seed.js";
import { getSetting, setSetting } from "../src/database/settings.js";
import { tmpDir } from "./helpers.js";

const open = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close(); // Windows can't delete an open file
});

// Today's default of EVERY setting. A change here means a default changed: add the OLD fingerprint to
// PREVIOUS_DEFAULTS (so installs still holding it get the new one), then update this line.
const TODAY = {
  "photos.displayMax": "bfa0ec8bdf294654",
  "photos.thumbMax": "ddfe0e8d462af661",
  "photos.jpegQuality": "8b940be7fb78aaa6",
  "photos.maxMegabytes": "d59eced1ded07f84",
  "photos.fullSizeMaxMegapixels": "b17ef6d19c7a5b1e",
  "designs.maxPerHouse": "624b60c58c9d8bfb",
  "windows.checkSeconds": "4e07408562bedb8b",
  "paints.maxImportMegabytes": "624b60c58c9d8bfb",
  "paints.autoLoad": "ccd3c5f361b4e770",
  "paints.colorOrder": "f6e43b5958b274a1",
  "finder.parts": "f8ba077756a487ab",
  "finder.priority": "97688972545dc716",
  "finder.houseMargin": "a7e46abf169710b3",
  "finder.houseMinShare": "d2cbad71ff333de6",
  "schemes.roleParts": "9815d5ff99ae7e7a",
  "schemes.harmony": "82fac382590bdac2",
  "aiphoto.workingPixels": "aa1e50acc912c068",
  "aiphoto.sharedGpuNoteMb": "e39eef82f61b21e2",
  "aiphoto.templates": "d8cd23b0f7781ac7",
  "aiphoto.compose": "5afc0446d8b847fa",
};

test("today's defaults are the ones this test knows, and none of them is listed as earlier", () => {
  expect(defaultsFingerprints(SETTING_DEFAULTS)).toEqual(TODAY);
  for (const [key, print] of Object.entries(TODAY)) expect(PREVIOUS_DEFAULTS[key] ?? []).not.toContain(print);
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
