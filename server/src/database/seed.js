// SPDX-License-Identifier: MIT
// The app's seed pass (app-structure §8, §16) — run by serve.js when the server starts and by the
// backup panel's Reset, never by createApp (a test's createApp(tmp) starts from an empty
// database). Every step is insert-if-missing: a value the user changed is never overwritten.
//
//   - the shared LLM stack's rows (providers, the model catalog, the engine presets, the routing):
//     the kit's seedLlm, which reads the feature data installLlm registered;
//   - this app's settings defaults (family rule 1: a value a user might change is a row, seeded);
//   - the provider registry, loaded from the seeded rows.

import { loadFromConfigs, seedLlm, stores } from "@delebash/core/llm";
import { getLogger } from "@delebash/core/platform/log";
import { DEFAULT_COMPOSE, DEFAULT_WORKING_SIZE } from "../aiphoto/pixels.js";
import { DEFAULT_PROMPT_TEMPLATES } from "../aiphoto/prompts.js";
import { DEFAULT_PART_PRIORITY } from "../finder.js";
import { HARMONY_DEFAULTS } from "../paints/index.js";
import { DEFAULT_PARTS } from "../segment/parts.js";
import { insertSettingIfMissing } from "./settings.js";

const log = getLogger("just_house_paint.seed");

const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * The app's settings and their first values — each key has its schema in schemas/settings.js. The
 * numbers are the measured ones (docs/dev/RESEARCH.md) or the engines' own.
 */
export const SETTING_DEFAULTS = {
  "photos.displayMax": 2048,
  "photos.thumbMax": 480,
  "photos.jpegQuality": 88,
  "photos.maxMegabytes": 40,
  "designs.maxPerHouse": 30,
  "paints.maxImportMegabytes": 30,
  "finder.parts": plain(DEFAULT_PARTS),
  "finder.priority": [...DEFAULT_PART_PRIORITY],
  "finder.useGpu": true,
  "finder.idleMinutes": 10,
  // parts stay on the house: a parked car's doors aren't the front door (RESEARCH §11)
  "finder.houseMargin": 0.02,
  "finder.houseMinShare": 0.5,
  "schemes.roleParts": {
    // the chimney is often brick or stone: a scheme never paints it — the Colors tab still can
    body: ["body", "garageDoor"],
    trim: ["trim", "columns", "railings", "gutters", "soffit", "windowTrim"],
    accent: ["frontDoor", "shutters"],
  },
  "schemes.harmony": plain(HARMONY_DEFAULTS),
  "aiphoto.workingPixels": DEFAULT_WORKING_SIZE.targetPixels,
  "aiphoto.templates": { ...DEFAULT_PROMPT_TEMPLATES },
  "aiphoto.compose": plain(DEFAULT_COMPOSE),
};

/** Add every missing setting; returns how many were added. */
export function seedSettings(db) {
  let added = 0;
  db.tx(() => {
    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) if (insertSettingIfMissing(db, key, value)) added++;
  });
  return added;
}

/** The whole seed pass. Never throws: a failed step is logged and the server still starts. */
export function seedWorkspace(db) {
  try {
    seedLlm(db);
  } catch (e) {
    log.warning(`the AI stack's seed failed: ${e?.message ?? e}`);
  }
  try {
    seedSettings(db);
  } catch (e) {
    log.warning(`the settings seed failed: ${e?.message ?? e}`);
  }
  try {
    loadFromConfigs(stores.getProviderStore().list());
  } catch (e) {
    log.warning(`the AI provider registry didn't load: ${e?.message ?? e}`);
  }
}
