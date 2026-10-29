// SPDX-License-Identifier: MIT
// The app's seed pass (app-structure §8, §16) — run by serve.js when the server starts and by the
// backup panel's Reset, never by createApp (a test's createApp(tmp) starts from an empty
// database). Every step is insert-if-missing: a value the user changed is never overwritten.
//
//   - the shared LLM stack's rows (providers, the model catalog, the engine presets, the routing):
//     the kit's seedLlm, which reads the feature data installLlm registered;
//   - this app's settings defaults (family rule 1: a value a user might change is a row, seeded) — and a
//     setting still at an earlier default upgraded to today's (previous_defaults.js, the kit's upgradeSettings);
//   - the settings that moved into the kit carried there (the kit's retireSettings): the part finder's
//     `finder.useGpu` and `finder.idleMinutes` (the kit's engines plan, round C);
//   - the provider registry, loaded from the seeded rows.

import { loadFromConfigs, seedLlm, stores } from "@delebash/core/llm";
import { retireSettings, upgradeSettings as upgradeToToday } from "@delebash/core/platform";
import { getLogger } from "@delebash/core/platform/log";
import { idleKey } from "@delebash/core/runner/runtimes";
import { DEFAULT_COMPOSE, DEFAULT_WORKING_SIZE } from "../aiphoto/pixels.js";
import { DEFAULT_PROMPT_TEMPLATES } from "../aiphoto/prompts.js";
import { DEFAULT_PART_PRIORITY } from "../finder.js";
import { BRANDS, COLOR_ORDER_DEFAULTS, HARMONY_DEFAULTS } from "../paints/index.js";
import { DEFAULT_FEATURE_PRESETS } from "../seed_presets.js";
import { DEFAULT_PARTS } from "../segment/parts.js";
import { PREVIOUS_DEFAULTS } from "./previous_defaults.js";
import { deleteSetting, getSetting, insertSettingIfMissing, setSetting } from "./settings.js";

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
  // Save image and the AI photo work on the original at most this size (a 48 MP photo held 4 GB painting)
  "photos.fullSizeMaxMegapixels": 16,
  "designs.maxPerHouse": 30,
  "windows.checkSeconds": 3,
  "paints.maxImportMegabytes": 30,
  // every brand's colors out of the box: each loads by itself until its owner turns it off
  "paints.autoLoad": Object.fromEntries(Object.keys(BRANDS).map((key) => [key, true])),
  // the color wall's order and the Color family filter (the cuts measured, RESEARCH §10)
  "paints.colorOrder": plain(COLOR_ORDER_DEFAULTS),
  // the finishes the brands sell exterior paint in, dullest first — each part's choice goes on the color list and card
  "paints.finishes": ["flat", "matte", "eggshell", "satin", "semigloss", "gloss"],
  "finder.parts": plain(DEFAULT_PARTS),
  "finder.priority": [...DEFAULT_PART_PRIORITY],
  // parts stay on the house: a parked car's doors aren't the front door (RESEARCH §11)
  "finder.houseMargin": 0.02,
  "finder.houseMinShare": 0.5,
  "schemes.roleParts": {
    // the chimney is often brick or stone: a scheme never paints it — the Colors tab still can
    body: ["body", "garageDoor"],
    trim: ["trim", "columns", "railings", "gutters", "soffit", "windowTrim", "decor"],
    accent: ["frontDoor", "shutters"],
  },
  "schemes.harmony": plain(HARMONY_DEFAULTS),
  "aiphoto.workingPixels": DEFAULT_WORKING_SIZE.targetPixels,
  // other programs holding this much of the graphics card make the AI photo slower (an idle 6.9 GB
  // model: 20 s → 28 s, RESEARCH §12) — its dialog says so above this; 0 = never
  "aiphoto.sharedGpuNoteMb": 1024,
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

/**
 * A setting that still holds an EARLIER default (database/previous_defaults.js) — its owner never
 * edited it — takes today's default, so a better default reaches an install made before it; a value
 * the owner changed is left alone. Returns the keys it upgraded.
 */
export function upgradeSettings(db) {
  const upgraded = upgradeToToday(db, { defaults: SETTING_DEFAULTS, previous: PREVIOUS_DEFAULTS, getSetting, setSetting });
  if (upgraded.length) log.info(`settings still at an earlier default, now today's: ${upgraded.join(", ")}`);
  return upgraded;
}

/**
 * The settings that moved into the kit (the engines plan, round C), carried over from an install or a backup made
 * before: `finder.useGpu` off → the part finder's preset runs on the processor (its executionProvider "cpu";
 * on stays the preset's "auto"); `finder.idleMinutes` → the kit's ONNX runtime idle time (AI Settings → Vision).
 * Returns the keys moved.
 */
export function moveRetiredSettings(db) {
  const moves = {
    "finder.useGpu": (on) => {
      if (on !== false) return;
      const presets = stores.getEnginePresetStore();
      const p = presets.get(DEFAULT_FEATURE_PRESETS["parts.find"]);
      if (p) presets.save({ ...p, params: { ...p.params, executionProvider: "cpu" } });
    },
    "finder.idleMinutes": (minutes) => {
      if (Number.isInteger(minutes) && minutes > 0) stores.getRunnerConfigStore().setSetting(idleKey("onnx"), String(minutes * 60));
    },
  };
  const { moved, kept } = retireSettings(db, moves, { getSetting, deleteSetting });
  if (moved.length) log.info(`settings now the AI stack's, carried over: ${moved.join(", ")}`);
  for (const k of kept) log.warning(`the setting ${k.key} couldn't move into the AI stack yet: ${k.error?.message ?? k.error}`);
  return moved;
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
    upgradeSettings(db);
  } catch (e) {
    log.warning(`the settings seed failed: ${e?.message ?? e}`);
  }
  try {
    moveRetiredSettings(db);
  } catch (e) {
    log.warning(`the settings that moved into the AI stack didn't carry over: ${e?.message ?? e}`);
  }
  try {
    loadFromConfigs(stores.getProviderStore().list());
  } catch (e) {
    log.warning(`the AI provider registry didn't load: ${e?.message ?? e}`);
  }
}
