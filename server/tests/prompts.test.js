// SPDX-License-Identifier: MIT
// A revised prompt reaches a database seeded before it; one its owner edited is never touched — and a prompt can't
// change without its old text kept (seed_feature_prompts.js FEATURE_PROMPT_HEALS, the kit's featurePromptHeals).
// The template's test (since 2026-11-10; JustDirect's shape — its dev database planned all day with its first
// prompts, 2026-11-08).
import { fingerprint } from "@delebash/core/platform";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { getDb } from "../src/app_state.js";
import { seedWorkspace } from "../src/database/seed.js";
import { DEFAULT_FEATURE_PROMPTS, FEATURE_PROMPT_HEALS } from "../src/seed_feature_prompts.js";
import { tmpDir, useHermeticKit } from "./helpers.js";

useHermeticKit();

// Today's system text of EVERY prompt row. A change here means a prompt changed: add its OLD text, byte for byte, to
// FEATURE_PROMPT_HEALS (so databases still holding it get the new one), then update this line.
const TODAY = {
  "schemes.suggest": "c0f39d46e9dbc51d",
};

test("today's prompts are the ones this test knows, and none of them is listed as an earlier text", () => {
  expect(Object.fromEntries(Object.entries(DEFAULT_FEATURE_PROMPTS).map(([k, v]) => [k, fingerprint(v.system)]))).toEqual(TODAY);
  for (const [key, olds] of Object.entries(FEATURE_PROMPT_HEALS)) {
    expect(DEFAULT_FEATURE_PROMPTS[key], key).toBeTruthy();
    expect(olds, key).not.toContain(DEFAULT_FEATURE_PROMPTS[key].system);
  }
});

// The app hands its heals to the kit: an earlier text listed for a key (made up here — no prompt is revised yet)
// is replaced at the next seed, and an edited prompt is left alone.
const KEY = "schemes.suggest";
const EARLIER = "You suggest paint color schemes for a house. (an earlier text, for this test)";
afterEach(() => {
  delete FEATURE_PROMPT_HEALS[KEY];
});

test("a prompt still at an earlier text takes today's at the next seed; an edited one is left alone", async () => {
  FEATURE_PROMPT_HEALS[KEY] = [EARLIER];
  await createApp(tmpDir());
  const db = getDb();
  seedWorkspace(db);
  const system = () => db.get("feature_prompts", KEY).system;
  expect(system()).toBe(DEFAULT_FEATURE_PROMPTS[KEY].system); // a fresh install holds today's
  db.update("feature_prompts", { system: EARLIER }, { key: KEY }); // as a database seeded before the revision
  seedWorkspace(db);
  expect(system()).toBe(DEFAULT_FEATURE_PROMPTS[KEY].system);
  const edited = `${EARLIER} Keep it short.`; // the owner's own words, never touched
  db.update("feature_prompts", { system: edited }, { key: KEY });
  seedWorkspace(db);
  expect(system()).toBe(edited);
});
