// SPDX-License-Identifier: MIT
// The app's settings — one schema per key (app-structure §16, family rule 1: a value a user might
// change is a row, seeded, editable in Settings). A key is a `settings` row seeded with its first
// value (database/seed.js SETTING_DEFAULTS); /v1/settings reads and writes only the keys listed
// here, and Settings builds its form rules from the same schemas.
// Browser-safe: this file imports only the kit's `platform/schema` (TypeBox).

import { opt, strictObject, T } from "@delebash/core/platform/schema";
import { PART_KEY } from "./houses.js";

const PartKey = T.String({ pattern: PART_KEY });

/** One part the finder looks for: its words to the model, its threshold, whether it is painted. */
export const PartRule = strictObject({
  key: PartKey,
  labelKey: T.String({ minLength: 1, maxLength: 80 }),
  prompts: T.Array(T.String({ minLength: 1, maxLength: 60 }), { minItems: 1, maxItems: 6 }),
  threshold: opt(T.Number({ exclusiveMinimum: 0, exclusiveMaximum: 1 })),
  paintable: T.Boolean(),
  group: T.String({ minLength: 1, maxLength: 40 }),
  method: opt(T.Union([T.Literal("text"), T.Literal("subtract")])),
  // parts taken out of this one (window trim = the window's outline minus its glass)
  minus: opt(T.Array(PartKey, { maxItems: 10 })),
  // how much of each piece must lie on the house itself (a fence's end board, a garden statue don't)
  onHouse: opt(T.Number({ minimum: 0, maximum: 1 })),
});

export const SETTINGS = {
  // The photo copies made when a photo is added.
  "photos.displayMax": T.Integer({ minimum: 512, maximum: 4096 }),
  "photos.thumbMax": T.Integer({ minimum: 128, maximum: 1024 }),
  "photos.jpegQuality": T.Integer({ minimum: 50, maximum: 100 }),
  "photos.maxMegabytes": T.Integer({ minimum: 1, maximum: 200 }),
  "photos.fullSizeMaxMegapixels": T.Integer({ minimum: 1, maximum: 200 }),
  "designs.maxPerHouse": T.Integer({ minimum: 1, maximum: 200 }),
  // how often an open window asks whether another window changed something (seconds)
  "windows.checkSeconds": T.Integer({ minimum: 1, maximum: 60 }),
  "paints.maxImportMegabytes": T.Integer({ minimum: 1, maximum: 200 }),
  // Which brands' colors the app loads by itself ({ brand: true | false }; a brand missing counts as
  // on) — on for every brand out of the box (the user's decision, 2026-10-18).
  "paints.autoLoad": T.Record(T.String({ maxLength: 40 }), T.Boolean(), { maxProperties: 50 }),
  // Ordering the colors by color (paints/order.js): CIE chroma under `grayChroma` is a near-gray, the
  // rest go in bands of `bandDegrees` of hue from the first family's start; the Color family filter's
  // families are hue ranges, each from its `from` to the next one's.
  "paints.colorOrder": strictObject({
    grayChroma: T.Number({ minimum: 0, maximum: 60 }),
    bandDegrees: T.Number({ minimum: 1, maximum: 360 }),
    families: T.Array(strictObject({ key: T.String({ pattern: "^[a-z][a-zA-Z0-9]*$", maxLength: 40 }), from: T.Number({ minimum: 0, exclusiveMaximum: 360 }) }), {
      minItems: 1,
      maxItems: 24,
    }),
  }),
  // The part finder: what it looks for (each part's prompts and threshold) and which part keeps a pixel two parts
  // claim — where it runs and when it lets go of its memory are the AI page's (its preset, the Vision tab).
  "finder.parts": T.Array(PartRule, { minItems: 1, maxItems: 40 }),
  "finder.priority": T.Array(PartKey, { maxItems: 40 }),
  // How far past the house a part may reach, as a share of the photo's longer side (0 = no limit).
  "finder.houseMargin": T.Number({ minimum: 0, maximum: 0.2 }),
  // How much of a found piece must lie on the house for it to count (a car's door in front doesn't).
  "finder.houseMinShare": T.Number({ minimum: 0, maximum: 1 }),
  // Color schemes: which parts each role paints, and the harmony rules. (The AI's prompt is the
  // kit's prompt row `schemes.suggest`, edited in the AI Lab.)
  "schemes.roleParts": strictObject({ body: T.Array(PartKey), trim: T.Array(PartKey), accent: T.Array(PartKey) }),
  "schemes.harmony": T.Record(
    T.String({ maxLength: 40 }),
    T.Union([T.Number(), T.Boolean(), T.String({ maxLength: 40 }), T.Array(T.String({ maxLength: 40 }), { maxItems: 40 }), T.Array(T.Number(), { maxItems: 40 })]),
    { maxProperties: 40 },
  ),
  // The AI photo: the model's working size (pixels), its prompt templates, how it is put back.
  "aiphoto.workingPixels": T.Integer({ minimum: 256 * 256, maximum: 1600 * 1200 }),
  // Other programs holding more graphics memory than this (MB) are named under the AI photo (0 = never).
  "aiphoto.sharedGpuNoteMb": T.Integer({ minimum: 0, maximum: 1024 * 1024 }),
  "aiphoto.templates": T.Record(T.String({ maxLength: 40 }), T.String({ maxLength: 2000 }), { maxProperties: 40 }),
  "aiphoto.compose": T.Record(T.String({ maxLength: 40 }), T.Union([T.Number(), T.Boolean(), T.Array(T.Number(), { maxItems: 40 })]), { maxProperties: 40 }),
};

export const SETTING_KEYS = Object.keys(SETTINGS);

/** PATCH /v1/settings — any of the keys, nothing else. */
export const SettingsPatch = strictObject(Object.fromEntries(SETTING_KEYS.map((k) => [k, opt(SETTINGS[k])])));
