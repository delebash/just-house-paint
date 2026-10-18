// SPDX-License-Identifier: MIT
// Every setting has a schema and a default, and every default passes its own schema — a seeded
// value can never be refused by /v1/settings.
import { model } from "@delebash/core/platform/models";
import { expect, test } from "vitest";
import { SETTING_DEFAULTS } from "../src/database/seed.js";
import { SETTINGS } from "../src/schemas/settings.js";
import { validatePartsConfig } from "../src/segment/parts.js";

test("the same keys on both sides", () => {
  expect(Object.keys(SETTING_DEFAULTS).sort()).toEqual(Object.keys(SETTINGS).sort());
});

test.each(Object.keys(SETTINGS))("%s's default passes its schema", (key) => {
  expect(() => model(SETTINGS[key], SETTING_DEFAULTS[key], key)).not.toThrow();
});

test("a parts recipe that breaks a rule is refused by its schema", () => {
  const bad = [{ key: "Bad Key", labelKey: "x", prompts: [], paintable: true, group: "g" }];
  expect(() => model(SETTINGS["finder.parts"], bad, "finder.parts")).toThrow();
  // and the default is one the finder accepts
  expect(() => validatePartsConfig(SETTING_DEFAULTS["finder.parts"])).not.toThrow();
});
