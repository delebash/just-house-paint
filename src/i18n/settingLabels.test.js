// SPDX-License-Identifier: MIT
// Every setting has a name a person knows it by — General's or Advanced's label, or where else it is set
// (settings.elsewhere): a restore that sets one back to its default names it by that (SettingsPage settingLabel), and
// a key with none showed raw ("paints.autoLoad" — the twentieth review).
import { expect, test } from "vitest";
import { SETTING_KEYS } from "just-house-paint-server/schemas/settings.js";
import en from "./locales/en.json";

const at = (path) => path.split(".").reduce((o, k) => o?.[k], en);

test("every setting key has a label on some screen", () => {
  const missing = SETTING_KEYS.filter((key) => !["general", "advanced", "elsewhere"].some((area) => typeof at(`settings.${area}.fields.${key}`) === "string"));
  expect(missing).toEqual([]);
});
